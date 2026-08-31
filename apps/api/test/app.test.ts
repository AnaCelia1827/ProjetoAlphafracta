/**
 * Teste de interface HTTP: verifica que a aplicação mínima mantém health
 * independente de adaptadores externos, como base para health checks de deploy.
 */
import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { createApp } from '../src/app.js';

describe('GET /health', () => {
  it('returns an OK service status', async () => {
    const response = await request(createApp()).get('/health');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok' });
  });
});
