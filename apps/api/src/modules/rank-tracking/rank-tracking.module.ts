import { Module } from '@nestjs/common';
import { RankTrackingController } from './rank-tracking.controller.js';

@Module({
	controllers: [RankTrackingController],
})
export class RankTrackingModule {}
