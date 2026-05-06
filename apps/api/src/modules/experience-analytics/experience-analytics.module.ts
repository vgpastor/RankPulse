import { Module } from '@nestjs/common';
import { ClarityController } from './clarity.controller.js';

@Module({
	controllers: [ClarityController],
})
export class ExperienceAnalyticsModule {}
