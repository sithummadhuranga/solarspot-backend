import {
  BeforeAll,
  AfterAll,
  Before,
  setDefaultTimeout,
} from '@cucumber/cucumber';
import { SolarWorld } from './world';
import { connectTestDb, disconnectTestDb, seedCore } from '../../integration/helpers';
import { seedDemoUsers } from '@/seed/05_demo_users';
import { Station } from '@modules/stations/station.model';
import mongoose from 'mongoose';

setDefaultTimeout(60 * 1000);

BeforeAll(async function () {
  await connectTestDb();
  await seedCore();
  const session = await mongoose.startSession();
  await session.withTransaction(() => seedDemoUsers(session));
  await session.endSession();
  await Station.init();
});

AfterAll(async function () {
  await disconnectTestDb();
});

Before(function (this: SolarWorld) {
  this.response  = null;
  this.authToken = '';
  this.stationId = null;
  this.userId    = null;
});
