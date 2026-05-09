import { Module } from '@nestjs/common';
import { CompetitorIntelligenceController } from './competitor-intelligence.controller.js';

@Module({
	controllers: [CompetitorIntelligenceController],
})
export class CompetitorIntelligenceModule {}
