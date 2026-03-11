import { Given, When, Then } from '@cucumber/cucumber';
import request from 'supertest';
import { SolarWorld } from '../support/world';
import app from '../../../../app';

Given('I am logged in as a station owner', async function (this: SolarWorld) {
  const res = await request(app)
    .post('/api/auth/login')
    .send({ email: 'owner@solarspot.app', password: 'Owner@2026!' });

  if (!res.body?.data?.accessToken) {
    throw new Error(`Login failed.\nBody: ${JSON.stringify(res.body, null, 2)}`);
  }
  this.authToken = res.body.data.accessToken;
});

When('I submit a new station without authentication', async function (this: SolarWorld) {
  this.response = await request(app)
    .post('/api/stations')
    .send({ name: 'Solar Hub Colombo', connectors: [{ type: 'USB-C', powerKw: 10, count: 2 }], solarPanelKw: 5 });
});

When('I submit a new station with missing required fields', async function (this: SolarWorld) {
  this.response = await request(app)
    .post('/api/stations')
    .set('Authorization', `Bearer ${this.authToken}`)
    .send({ name: 'Incomplete Station' });
});

When('I submit a new station with valid details', async function (this: SolarWorld) {
  this.response = await request(app)
    .post('/api/stations')
    .set('Authorization', `Bearer ${this.authToken}`)
    .send({
      name: 'BDD Test Solar Hub',
      addressString: 'Galle Rd, Colombo 03',
      lat: 6.9271,
      lng: 79.8612,
      connectors: [{ type: 'USB-C', powerKw: 10, count: 2 }],
      solarPanelKw: 5,
    });
});

Then('the station should be in pending status', function (this: SolarWorld) {
  const status = this.response?.body?.data?.status;
  if (status !== 'pending') {
    throw new Error(`Expected station status to be "pending" but got "${status}".\nBody: ${JSON.stringify(this.response?.body, null, 2)}`);
  }
});
