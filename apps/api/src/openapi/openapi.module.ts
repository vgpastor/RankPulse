import { Module } from '@nestjs/common';
import { OpenApiController } from './openapi.controller.js';

@Module({ controllers: [OpenApiController] })
export class OpenApiModule {}
