const { schemas } = require('../src/utils/validation');

describe('CloudPanel API Validation Tests', () => {
  describe('Schema Validation', () => {
    it('should validate Node.js site schema', () => {
      const validData = {
        domainName: 'test.com',
        nodejsVersion: 20,
        appPort: 3000,
        siteUser: 'testuser',
        siteUserPassword: 'password123'
      };
      
      const { error } = schemas.addNodejsSite.validate(validData);
      expect(error).toBeUndefined();
    });

    it('should reject invalid Node.js version', () => {
      const invalidData = {
        domainName: 'test.com',
        nodejsVersion: 99,
        appPort: 3000,
        siteUser: 'testuser',
        siteUserPassword: 'password123'
      };
      
      const { error } = schemas.addNodejsSite.validate(invalidData);
      expect(error).toBeDefined();
    });

    it('should validate user creation schema', () => {
      const validData = {
        userName: 'testuser',
        email: 'test@example.com',
        firstName: 'Test',
        lastName: 'User',
        password: 'password123',
        role: 'admin'
      };
      
      const { error } = schemas.addUser.validate(validData);
      expect(error).toBeUndefined();
    });

    it('should reject invalid email format', () => {
      const invalidData = {
        userName: 'testuser',
        email: 'not-an-email',
        firstName: 'Test',
        lastName: 'User',
        password: 'password123',
        role: 'admin'
      };
      
      const { error } = schemas.addUser.validate(invalidData);
      expect(error).toBeDefined();
    });

    it('should validate database creation schema', () => {
      const validData = {
        domainName: 'test.com',
        databaseName: 'testdb',
        databaseUserName: 'testuser',
        databaseUserPassword: 'password123'
      };
      
      const { error } = schemas.addDatabase.validate(validData);
      expect(error).toBeUndefined();
    });
  });
});
