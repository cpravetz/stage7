import '@testing-library/jest-dom';
import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ModelCatalogCard, {
  EMPTY_MODEL_DRAFT,
  buildModelPayload,
  parseCapabilities,
} from './ModelCatalogCard';
import { fetchJSON } from '../utils/api';

vi.mock('../utils/api', () => ({
  fetchJSON: vi.fn(),
  postJSON: vi.fn(),
}));

const mockedFetchJSON = vi.mocked(fetchJSON);

afterEach(() => {
  vi.clearAllMocks();
});

describe('parseCapabilities', () => {
  it('trims entries, drops empties, and de-duplicates', () => {
    expect(parseCapabilities(' reasoning, vision ,,reasoning, ')).toEqual(['reasoning', 'vision']);
    expect(parseCapabilities('')).toEqual([]);
  });
});

describe('buildModelPayload', () => {
  const VALID = { ...EMPTY_MODEL_DRAFT, id: ' llama3:8b ', provider: 'ollama', costPer1kTokens: '0', maxTokens: '8192', capabilities: 'reasoning, vision' };

  it('builds a numeric payload from the raw draft', () => {
    const result = buildModelPayload(VALID);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.model).toEqual({
        id: 'llama3:8b',
        provider: 'ollama',
        costPer1kTokens: 0,
        maxTokens: 8192,
        capabilities: ['reasoning', 'vision'],
      });
    }
  });

  it('requires id and provider', () => {
    expect(buildModelPayload({ ...VALID, id: '  ', provider: '' })).toMatchObject({ ok: false, error: 'Model id and provider are required.' });
  });

  it('rejects a negative or missing cost', () => {
    expect(buildModelPayload({ ...VALID, costPer1kTokens: '-1' })).toMatchObject({ ok: false });
    expect(buildModelPayload({ ...VALID, costPer1kTokens: '' })).toMatchObject({ ok: false });
  });

  it('rejects a non-integer max token count', () => {
    expect(buildModelPayload({ ...VALID, maxTokens: '8192.5' })).toMatchObject({ ok: false });
    expect(buildModelPayload({ ...VALID, maxTokens: '0' })).toMatchObject({ ok: false });
  });
});

describe('ModelCatalogCard', () => {
  it('shows an empty-catalog message with a registration form when no models exist', async () => {
    mockedFetchJSON.mockResolvedValue({ models: [] });
    render(<ModelCatalogCard />);

    await waitFor(() => {
      expect(screen.getByText('No models are registered yet. Register one below, or check that Brain providers are configured.')).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: 'Register Model' })).toBeInTheDocument();
  });

  it('lists registered models with their provider and capabilities', async () => {
    mockedFetchJSON.mockResolvedValue({
      models: [{ id: 'llama3:8b', provider: 'ollama', costPer1kTokens: 0, maxTokens: 8192, capabilities: ['reasoning'] }],
    });
    render(<ModelCatalogCard />);

    await waitFor(() => {
      expect(screen.getByText('llama3:8b')).toBeInTheDocument();
    });
    expect(screen.getByText('ollama')).toBeInTheDocument();
    expect(screen.getByText('reasoning')).toBeInTheDocument();
  });

  it('offers a retry when the catalog cannot be loaded', async () => {
    mockedFetchJSON.mockRejectedValue(new Error('API error: 503 Service Unavailable for /api/brain/models'));
    render(<ModelCatalogCard />);

    await waitFor(() => {
      expect(screen.getByText(/API error: 503/)).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });

  it('does not describe the catalog as the routing allow-list (regression tripwire)', async () => {
    mockedFetchJSON.mockResolvedValue({ models: [] });
    const { container } = render(<ModelCatalogCard />);

    await waitFor(() => {
      expect(screen.getByText('No models are registered yet. Register one below, or check that Brain providers are configured.')).toBeInTheDocument();
    });
    expect(container.textContent).not.toContain('allow-list');
  });
});
