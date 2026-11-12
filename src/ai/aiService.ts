import { datesBetween } from '../domain/days';
import type { TripRepository } from '../data/TripRepository';
import type { RoutingService } from '../routing/RoutingService';
import type { BudgetService } from '../services/budgetService';
import type { TripService } from '../services/tripService';
import { resolvePlaces } from './placeResolver';
import { buildIdeasPrompt, buildItineraryPrompt, openInClaudeUrl } from './promptBuilder';
import { parseIdeas, parseItinerary, type ParseResult } from './responseParser';
import { CreationError, createTripFromItinerary, type CreationResult } from './tripFromItinerary';
import type { AiDraft, Brief, DraftStage } from './types';

export interface AiRequest {
  prompt: string;
  kind: 'ideas' | 'itinerary';
  openUrl: string | null;
}

export interface AiService {
  startDraft(brief: Brief): Promise<AiDraft>;
  buildRequest(draftId: string): Promise<AiRequest>;
  receiveIdeas(draftId: string, text: string): Promise<ParseResult<AiDraft>>;
  chooseIdea(draftId: string, ideaId: string): Promise<AiDraft>;
  receiveItinerary(draftId: string, text: string): Promise<ParseResult<AiDraft>>;
  create(draftId: string, onProgress?: (done: number, total: number) => void): Promise<CreationResult>;
}

export const STAGE_ERROR = 'Cette étape n’est pas disponible pour ce brouillon.';

export function createAiService(deps: {
  repo: TripRepository;
  routing: RoutingService;
  tripService: TripService;
  budgetService: BudgetService;
  today?: () => string;
}): AiService {
  const { repo } = deps;
  const today = deps.today ?? (() => new Date().toISOString().slice(0, 10));
  const need = (d: AiDraft, stages: DraftStage[]) => {
    if (!stages.includes(d.stage)) throw new Error(STAGE_ERROR);
  };
  const save = (d: AiDraft, patch: Partial<AiDraft>) => repo.saveDraft({ ...d, ...patch });

  return {
    async startDraft(brief) {
      const mode = brief.destination?.trim() ? 'known' : 'surprise';
      return repo.saveDraft({
        stage: 'brief', mode, brief, ideas: null, chosenIdeaId: null, itinerary: null, tripId: null, protocolVersion: 1, updatedAt: '',
      });
    },

    async buildRequest(draftId) {
      const d = await repo.getDraft(draftId);
      if (d.mode === 'surprise' && d.chosenIdeaId === null) {
        need(d, ['brief', 'ideas_requested', 'ideas_received']);
        const prompt = buildIdeasPrompt(d.brief, today());
        await save(d, { stage: 'ideas_requested' });
        return { prompt, kind: 'ideas', openUrl: openInClaudeUrl(prompt) };
      }
      need(d, d.mode === 'known' ? ['brief', 'itinerary_requested', 'itinerary_received'] : ['idea_chosen', 'itinerary_requested', 'itinerary_received']);
      const idea = d.mode === 'surprise' ? (d.ideas ?? []).find((i) => i.id === d.chosenIdeaId) ?? null : null;
      const prompt = buildItineraryPrompt(d.brief, idea, today());
      await save(d, { stage: 'itinerary_requested' });
      return { prompt, kind: 'itinerary', openUrl: openInClaudeUrl(prompt) };
    },

    async receiveIdeas(draftId, text) {
      const d = await repo.getDraft(draftId);
      need(d, ['ideas_requested', 'ideas_received']);
      const r = parseIdeas(text);
      if (!r.ok) return r;
      const saved = await save(d, { ideas: r.value.ideas, stage: 'ideas_received', chosenIdeaId: null });
      return { ok: true, value: saved, warnings: r.warnings };
    },

    async chooseIdea(draftId, ideaId) {
      const d = await repo.getDraft(draftId);
      need(d, ['ideas_received', 'idea_chosen']);
      if (!d.ideas?.some((i) => i.id === ideaId)) throw new Error('Idée inconnue.');
      return save(d, { chosenIdeaId: ideaId, stage: 'idea_chosen' });
    },

    async receiveItinerary(draftId, text) {
      const d = await repo.getDraft(draftId);
      need(d, ['itinerary_requested', 'itinerary_received']);
      const r = parseItinerary(text, { tripDays: datesBetween(d.brief.startDate, d.brief.endDate).length });
      if (!r.ok) return r;
      const saved = await save(d, { itinerary: r.value, stage: 'itinerary_received' });
      return { ok: true, value: saved, warnings: r.warnings };
    },

    async create(draftId, onProgress) {
      const d = await repo.getDraft(draftId);
      if (d.stage === 'created' || d.tripId) throw new Error('Ce voyage est déjà créé.');
      need(d, ['itinerary_received']);
      const itinerary = d.itinerary!;
      const places = itinerary.days.flatMap((day) => day.stops.map((s) => s.place));
      const resolved = await resolvePlaces(places, { routing: deps.routing, onProgress });
      const result = await createTripFromItinerary(
        { repo, tripService: deps.tripService, budgetService: deps.budgetService, today: today() },
        { brief: d.brief, itinerary, resolved },
      );
      try {
        await save(d, { stage: 'created', tripId: result.tripId });
      } catch (e) {
        // Brouillon non mis à jour : on retire le voyage pour qu'un réessai ne crée pas de doublon.
        try {
          await repo.deleteTrip(result.tripId);
        } catch {
          throw new CreationError('Le voyage est créé mais son brouillon n’a pas pu être mis à jour : ne recrée pas le voyage, ouvre « Mes voyages ».', e);
        }
        throw e;
      }
      return result;
    },
  };
}
