import { JWTService } from '../lib/jwt';
import jwt from 'jsonwebtoken';

// Mock jsonwebtoken
jest.mock('jsonwebtoken');
const mockJwt = jwt as jest.Mocked<typeof jwt>;

describe('JWTService', () => {
  const mockUser = {
    id: 'user-123',
    email: 'test@example.com',
    name: 'Test User',
    password: 'hashed-password',
    isGuest: false,
    createdAt: new Date(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('generateToken', () => {
    it('should generate a token for a regular user', () => {
      const mockToken = 'mock-jwt-token';
      mockJwt.sign.mockReturnValue(mockToken as any);

      const token = JWTService.generateToken(mockUser);

      expect(token).toBe(mockToken);
      expect(mockJwt.sign).toHaveBeenCalledWith(
        {
          userId: mockUser.id,
          email: mockUser.email,
          isGuest: mockUser.isGuest,
        },
        expect.any(String),
        { expiresIn: expect.any(String) }
      );
    });

    it('should generate a token for a guest user', () => {
      const guestUser = { ...mockUser, isGuest: true };
      const mockToken = 'mock-guest-token';
      mockJwt.sign.mockReturnValue(mockToken as any);

      const token = JWTService.generateToken(guestUser);

      expect(token).toBe(mockToken);
      expect(mockJwt.sign).toHaveBeenCalledWith(
        {
          userId: guestUser.id,
          email: guestUser.email,
          isGuest: true,
        },
        expect.any(String),
        { expiresIn: expect.any(String) }
      );
    });
  });

  describe('verifyToken', () => {
    it('should verify a valid token', () => {
      const mockPayload = {
        userId: 'user-123',
        email: 'test@example.com',
        isGuest: false,
      };
      mockJwt.verify.mockReturnValue(mockPayload as any);

      const result = JWTService.verifyToken('valid-token');

      expect(result).toEqual(mockPayload);
      expect(mockJwt.verify).toHaveBeenCalledWith('valid-token', expect.any(String));
    });

    it('should return null for an invalid token', () => {
      mockJwt.verify.mockImplementation(() => {
        throw new Error('Invalid token');
      });

      const result = JWTService.verifyToken('invalid-token');

      expect(result).toBeNull();
    });
  });

  describe('generateGuestToken', () => {
    it('should generate a token for a guest user', () => {
      const mockToken = 'mock-guest-token';
      mockJwt.sign.mockReturnValue(mockToken as any);

      const token = JWTService.generateGuestToken();

      expect(token).toBe(mockToken);
      expect(mockJwt.sign).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: expect.stringMatching(/^guest-/),
          email: '',
          isGuest: true,
        }),
        expect.any(String),
        { expiresIn: expect.any(String) }
      );
    });
  });
});