import { Controller, Get, Header, Res } from '@nestjs/common';
import type { Response } from 'express';
import { Public } from '../common/auth/jwt-auth.guard.js';
import { buildOpenApiDocument } from './spec.js';

const SWAGGER_HTML = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>RankPulse API · Docs</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5.17.14/swagger-ui.css" />
  <style>body { margin: 0; }</style>
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5.17.14/swagger-ui-bundle.js"></script>
  <script>
    window.onload = () => {
      window.ui = SwaggerUIBundle({
        url: '/openapi.json',
        dom_id: '#swagger-ui',
        deepLinking: true,
      });
    };
  </script>
</body>
</html>`;

let cachedDoc: unknown | null = null;

const getDoc = (): unknown => {
	if (!cachedDoc) cachedDoc = buildOpenApiDocument();
	return cachedDoc;
};

@Controller()
export class OpenApiController {
	@Public()
	@Get('openapi.json')
	@Header('Content-Type', 'application/json; charset=utf-8')
	openapi(): unknown {
		return getDoc();
	}

	@Public()
	@Get('docs')
	@Header('Content-Type', 'text/html; charset=utf-8')
	docs(@Res() res: Response): void {
		res.send(SWAGGER_HTML);
	}
}
