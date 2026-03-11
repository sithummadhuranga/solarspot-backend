import { Given, When, Then } from '@cucumber/cucumber';
import request from 'supertest';
import { SolarWorld } from '../support/world';
import app from '../../../../app';

Given('the SolarSpot API is running', function (this: SolarWorld) {});

When('I request the list of all stations', async function (this: SolarWorld) {
  this.response = await request(app).get('/api/stations');
});

When(
  'I request the list of stations with page {int} and limit {int}',
  async function (this: SolarWorld, page: number, limit: number) {
    this.response = await request(app).get(`/api/stations?page=${page}&limit=${limit}`);
  },
);

When(
  'I search for stations with keyword {string}',
  async function (this: SolarWorld, keyword: string) {
    this.response = await request(app).get(`/api/stations/search?q=${encodeURIComponent(keyword)}`);
  },
);

When('I search for stations without providing a keyword', async function (this: SolarWorld) {
  this.response = await request(app).get('/api/stations/search');
});

When(
  'I request nearby stations at latitude {float} and longitude {float}',
  async function (this: SolarWorld, lat: number, lng: number) {
    this.response = await request(app).get(`/api/stations/nearby?lat=${lat}&lng=${lng}`);
  },
);

When(
  'I request nearby stations with only latitude {float}',
  async function (this: SolarWorld, lat: number) {
    this.response = await request(app).get(`/api/stations/nearby?lat=${lat}`);
  },
);

When(
  'I request nearby stations with only longitude {float}',
  async function (this: SolarWorld, lng: number) {
    this.response = await request(app).get(`/api/stations/nearby?lng=${lng}`);
  },
);

Then(
  'the response status should be {int}',
  function (this: SolarWorld, expectedStatus: number) {
    const actual = this.response?.status;
    if (actual !== expectedStatus) {
      throw new Error(
        `Expected HTTP ${expectedStatus} but got ${actual}.\nBody: ${JSON.stringify(this.response?.body, null, 2)}`,
      );
    }
  },
);

Then('the response should contain a success true field', function (this: SolarWorld) {
  if (this.response?.body?.success !== true) {
    throw new Error(
      `Expected body.success to be true.\nBody: ${JSON.stringify(this.response?.body, null, 2)}`,
    );
  }
});

Then('the response data should be an array', function (this: SolarWorld) {
  const data = this.response?.body?.data;
  if (!Array.isArray(data)) {
    throw new Error(
      `Expected body.data to be an array.\nBody: ${JSON.stringify(this.response?.body, null, 2)}`,
    );
  }
});
