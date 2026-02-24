import fs from 'fs';
import path from 'path';
import mongoose from 'mongoose';
import { EmailService, IMailTransport } from '@utils/email.service';

// Mock mail transport
class MockMailTransport implements IMailTransport {
  sendMail = jest.fn().mockResolvedValue(undefined);
}

// Mock User model for dynamic import
jest.mock('@modules/users/user.model', () => ({
  __esModule: true,
  default: {
    findById: jest.fn().mockReturnValue({
      lean: jest.fn().mockResolvedValue({
        _id: new mongoose.Types.ObjectId(),
        email: 'user@example.com',
        displayName: 'Test User',
      }),
    }),
    find: jest.fn().mockResolvedValue([
      {
        _id: new mongoose.Types.ObjectId(),
        email: 'admin@example.com',
        displayName: 'Admin User',
        isActive: true,
      },
    ]),
  },
}));

describe('EmailService', () => {
  let mockTransport: MockMailTransport;
  let emailService: EmailService;

  beforeEach(() => {
    mockTransport = new MockMailTransport();
    emailService = new EmailService(mockTransport);
    jest.clearAllMocks();
  });

  describe('loadTemplate()', () => {
    it('should load HTML template and replace variables', () => {
      const html = (emailService as any).loadTemplate(
        'verify-email',
        {
          DISPLAY_NAME: 'John Doe',
          VERIFY_URL: 'https://example.com/verify',
          EXPIRY_HOURS: '24',
          APP_NAME: 'SolarSpot',
          APP_URL: 'http://localhost:3000',
          YEAR: '2026',
        },
        'html'
      );

      expect(html).toContain('John Doe');
      expect(html).toContain('https://example.com/verify');
      expect(html).toContain('24');
      expect(html).not.toContain('{{DISPLAY_NAME}}');
      expect(html).not.toContain('{{VERIFY_URL}}');
    });

    it('should load text template and replace variables', () => {
      const text = (emailService as any).loadTemplate(
        'verify-email',
        {
          DISPLAY_NAME: 'John Doe',
          VERIFY_URL: 'https://example.com/verify',
          APP_NAME: 'SolarSpot',
          APP_URL: 'http://localhost:3000',
          YEAR: '2026',
        },
        'txt'
      );

      expect(text).toContain('John Doe');
      expect(text).toContain('https://example.com/verify');
      expect(text).not.toContain('{{DISPLAY_NAME}}');
    });

    it('should replace universal variables (APP_NAME, APP_URL, YEAR)', () => {
      const html = (emailService as any).loadTemplate(
        'welcome',
        {
          DISPLAY_NAME: 'Jane',
          MAP_URL: 'http://localhost:3000/map',
          APP_NAME: 'SolarSpot',
          APP_URL: 'http://localhost:3000',
          YEAR: '2026',
        },
        'html'
      );

      expect(html).toContain('SolarSpot'); // APP_NAME
      expect(html).toContain(new Date().getFullYear().toString()); // YEAR
    });

    it('should throw error if template file not found', () => {
      expect(() => {
        (emailService as any).loadTemplate('nonexistent', {}, 'html');
      }).toThrow();
    });
  });

  describe('sendVerificationEmail()', () => {
    it('should send verification email with correct content', async () => {
      await emailService.sendVerificationEmail('newuser@example.com', 'New User', 'test-token-123');

      expect(mockTransport.sendMail).toHaveBeenCalledTimes(1);
      expect(mockTransport.sendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'newuser@example.com',
          subject: expect.stringContaining('Verify'),
        })
      );
    });

    it('should include verification token in URL', async () => {
      await emailService.sendVerificationEmail('user@example.com', 'Test User', 'unique-token');

      const callArgs = mockTransport.sendMail.mock.calls[0][0];
      expect(callArgs.html).toContain('unique-token');
    });
  });

  describe('sendPasswordResetEmail()', () => {
    it('should send password reset email', async () => {
      await emailService.sendPasswordResetEmail('user@example.com', 'Forgot Password User', 'reset-token-456');

      expect(mockTransport.sendMail).toHaveBeenCalledTimes(1);
      expect(mockTransport.sendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'user@example.com',
          subject: expect.stringContaining('Reset'),
        })
      );
    });

    it('should include reset token in URL', async () => {
      await emailService.sendPasswordResetEmail('user@example.com', 'User', 'reset-xyz');

      const callArgs = mockTransport.sendMail.mock.calls[0][0];
      expect(callArgs.html).toContain('reset-xyz');
    });
  });

  describe('sendWelcomeEmail()', () => {
    it('should send welcome email after verification', async () => {
      await emailService.sendWelcomeEmail('verified@example.com', 'Verified User');

      expect(mockTransport.sendMail).toHaveBeenCalledTimes(1);
      expect(mockTransport.sendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'verified@example.com',
          subject: expect.stringContaining('Welcome'),
        })
      );
    });
  });

  describe('sendStationApprovedEmail()', () => {
    it('should send station approval notification', async () => {
      const userId = new mongoose.Types.ObjectId();

      await emailService.sendStationApprovedEmail(userId, 'Test Charging Station', userId.toString());

      expect(mockTransport.sendMail).toHaveBeenCalledTimes(1);
    });
  });

  describe('sendStationRejectionEmail()', () => {
    it('should send station rejection notification with reason', async () => {
      const userId = new mongoose.Types.ObjectId();

      await emailService.sendStationRejectionEmail(userId, 'Rejected Station', 'Incomplete information');

      expect(mockTransport.sendMail).toHaveBeenCalledTimes(1);
      
      const callArgs = mockTransport.sendMail.mock.calls[0][0];
      expect(callArgs.html).toContain('Incomplete information');
      expect(callArgs.html).toContain('Rejected Station');
    });
  });

  describe('sendQuotaAlertEmail()', () => {
    it('should send quota alert to all admins', async () => {
      await emailService.sendQuotaAlertEmail('openweathermap', 85, 850, 1000);

      expect(mockTransport.sendMail).toHaveBeenCalled();
      
      const callArgs = mockTransport.sendMail.mock.calls[0][0];
      expect(callArgs.subject).toContain('Quota Alert');
      expect(callArgs.html).toContain('OPENWEATHERMAP');
      expect(callArgs.html).toContain('85');
    });

    it('should handle multiple admin recipients', async () => {
      const User = require('@modules/users/user.model').default;
      User.find = jest.fn().mockResolvedValue([
        { email: 'admin1@example.com', displayName: 'Admin 1', isActive: true },
        { email: 'admin2@example.com', displayName: 'Admin 2', isActive: true },
      ]);

      await emailService.sendQuotaAlertEmail('brevo', 90, 270, 300);

      expect(mockTransport.sendMail).toHaveBeenCalled();
    });
  });

  describe('sendPermissionChangeEmail()', () => {
    it('should send permission change notification', async () => {
      const mockTargetUser = {
        _id: new mongoose.Types.ObjectId(),
        email: 'target@example.com',
        displayName: 'Target User',
      };
      const mockChangedByUser = {
        _id: new mongoose.Types.ObjectId(),
        email: 'admin@example.com',
        displayName: 'Admin',
      };

      const User = require('@modules/users/user.model').default;
      User.findById = jest.fn((id) => ({
        lean: jest.fn().mockResolvedValue(
          id.toString() === mockTargetUser._id.toString() ? mockTargetUser : mockChangedByUser
        ),
      }));

      await emailService.sendPermissionChangeEmail(
        mockTargetUser._id,
        mockChangedByUser._id,
        'Permission granted: stations.create',
        'grant',
        'Promoted to contributor',
        'You can now create charging stations'
      );

      expect(mockTransport.sendMail).toHaveBeenCalledTimes(1);
    });

    it('should accept string IDs for user references', async () => {
      const mockUser = {
        _id: new mongoose.Types.ObjectId(),
        email: 'user@example.com',
        displayName: 'User',
      };

      const User = require('@modules/users/user.model').default;
      User.findById = jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue(mockUser),
      });

      await expect(
        emailService.sendPermissionChangeEmail(
          'user-id-string',
          'admin-id-string',
          'Permission test',
          'grant',
          'Test',
          'Impact test'
        )
      ).resolves.not.toThrow();
    });
  });

  describe('Error Handling', () => {
    it('should handle email sending failures gracefully', async () => {
      mockTransport.sendMail.mockRejectedValueOnce(new Error('SMTP connection failed'));

      await expect(
        emailService.sendWelcomeEmail('fail@example.com', 'Fail User')
      ).rejects.toThrow('SMTP connection failed');
    });

    it('should validate email addresses', async () => {
      await expect(
        emailService.sendWelcomeEmail('', 'No Email User')
      ).resolves.not.toThrow();
    });
  });

  describe('Template Consistency', () => {
    it('should have both HTML and text versions for all templates', () => {
      const templatesDir = path.join(process.cwd(), 'src', 'templates');
      const templates = [
        'verify-email',
        'reset-password',
        'welcome',
        'station-approved',
        'station-rejected',
        'quota-alert',
        'permission-change',
      ];

      templates.forEach(template => {
        const htmlPath = path.join(templatesDir, `${template}.html`);
        const txtPath = path.join(templatesDir, `${template}.txt`);

        expect(fs.existsSync(htmlPath)).toBe(true);
        expect(fs.existsSync(txtPath)).toBe(true);
      });
    });
  });
});
