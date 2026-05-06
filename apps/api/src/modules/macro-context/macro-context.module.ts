import { Module } from '@nestjs/common';
import { RadarController } from './radar.controller.js';

@Module({
	controllers: [RadarController],
})
export class MacroContextModule {}
