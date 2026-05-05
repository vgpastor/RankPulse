import { Module } from '@nestjs/common';
import { PageSpeedController } from './page-speed.controller.js';

@Module({
	controllers: [PageSpeedController],
})
export class WebPerformanceModule {}
