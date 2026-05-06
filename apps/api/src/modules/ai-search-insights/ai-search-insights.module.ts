import { Module } from '@nestjs/common';
import { AiSearchInsightsController } from './ai-search-insights.controller.js';

@Module({
	controllers: [AiSearchInsightsController],
})
export class AiSearchInsightsModule {}
