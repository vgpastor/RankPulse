import { Module } from '@nestjs/common';
import { PortfoliosController } from './portfolios.controller.js';
import { ProjectsController } from './projects.controller.js';

@Module({
	controllers: [ProjectsController, PortfoliosController],
})
export class ProjectManagementModule {}
