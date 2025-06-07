const request = require('supertest');
const app = require('../src/index');

describe('CloudPanel API', () => {
  describe('Health Check', () => {
    it('should return health status', async () => {
      const res = await request(app)
        .get('/health')
        .expect(200);
      
      expect(res.body.status).toBe('OK');
      expect(res.body.service).toBe('CloudPanel API Node.js');
    });
  });

  describe('API Documentation', () => {
    it('should return API documentation', async () => {
      const res = await request(app)
        .get('/api/docs')
        .expect(200);
      
      expect(res.body.name).toBe('CloudPanel API');
      expect(res.body.endpoints).toBeDefined();
    });
  });

  describe('404 Handler', () => {
    it('should return 404 for unknown endpoints', async () => {
      const res = await request(app)
        .get('/unknown-endpoint')
        .expect(404);
      
      expect(res.body.error).toBe('Endpoint not found');
    });
  });
});
