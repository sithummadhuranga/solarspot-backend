import { World, IWorldOptions, setWorldConstructor } from '@cucumber/cucumber';

export class SolarWorld extends World {
  response: any = null;
  authToken: string = '';
  stationId: string | null = null;
  userId: string | null = null;

  constructor(options: IWorldOptions) {
    super(options);
  }
}

setWorldConstructor(SolarWorld);
