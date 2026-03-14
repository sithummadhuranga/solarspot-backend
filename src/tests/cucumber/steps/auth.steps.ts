import { When, Then } from '@cucumber/cucumber';
import request from 'supertest';
import { SolarWorld } from '../support/world';
import app from '../../../../app';

When(
  'I register a new user with display name {string}, email {string} and password {string}',
  async function (this: SolarWorld, displayName: string, email: string, password: string) {
    this.response = await request(app)
      .post('/api/auth/register')
      .send({
        displayName,
        email,
        password,
      });
  },
);

When(
  'I log in with email {string} and password {string}',
  async function (this: SolarWorld, email: string, password: string) {
    this.response = await request(app)
      .post('/api/auth/login')
      .send({
        email: email,
        password: password,
      });
  },
);

Then('the response data should have an access token', function (this: SolarWorld) {
  const accessToken = this.response?.body?.data?.accessToken;
  if (!accessToken) {
    throw new Error(
      `Expected response to contain an access token.\nBody: ${JSON.stringify(this.response?.body, null, 2)}`,
    );
  }
});
