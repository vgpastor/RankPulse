import { Module } from '@nestjs/common';
import { GscController } from './gsc.controller.js';

@Module({
	controllers: [GscController],
})
export class SearchConsoleInsightsModule {}
