import { Module } from '@nestjs/common';
import { Ga4Controller } from './ga4.controller.js';

@Module({
	controllers: [Ga4Controller],
})
export class TrafficAnalyticsModule {}
