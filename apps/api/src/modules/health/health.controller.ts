import { Controller, Get, Inject } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { DrizzlePersistence } from '@rankpulse/infrastructure';
import { sql } from 'drizzle-orm';
import { Public } from '../../common/auth/jwt-auth.guard.js';
import { Tokens } from '../../composition/tokens.js';

interface HealthStatus {
	status: 'ok' | 'degraded';
	checks: Record<string, 'ok' | 'failing'>;
}

@ApiTags('health')
@Controller()
export class HealthController {
	constructor(@Inject(Tokens.DrizzleClient) private readonly drizzle: DrizzlePersistence.DrizzleClient) {}

	@Public()
	@Get('healthz')
	@ApiOperation({ summary: 'Liveness probe' })
	healthz(): { status: 'ok' } {
		return { status: 'ok' };
	}

	@Public()
	@Get('readyz')
	@ApiOperation({ summary: 'Readiness probe (verifies database connection)' })
	async readyz(): Promise<HealthStatus> {
		const checks: Record<string, 'ok' | 'failing'> = {};
		try {
			await this.drizzle.db.execute(sql`select 1`);
			checks.database = 'ok';
		} catch {
			checks.database = 'failing';
		}
		const allOk = Object.values(checks).every((v) => v === 'ok');
		return { status: allOk ? 'ok' : 'degraded', checks };
	}
}
