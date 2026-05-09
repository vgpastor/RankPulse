import { Module } from '@nestjs/common';
import { CockpitController } from './cockpit.controller.js';
import { GscController } from './gsc.controller.js';

@Module({
	controllers: [GscController, CockpitController],
})
export class SearchConsoleInsightsModule {}
