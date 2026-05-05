import { Module } from '@nestjs/common';
import { WikipediaController } from './wikipedia.controller.js';

@Module({
	controllers: [WikipediaController],
})
export class EntityAwarenessModule {}
