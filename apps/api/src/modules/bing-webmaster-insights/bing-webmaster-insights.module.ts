import { Module } from '@nestjs/common';
import { BingController } from './bing.controller.js';

@Module({
	controllers: [BingController],
})
export class BingWebmasterInsightsModule {}
