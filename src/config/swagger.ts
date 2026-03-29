import swaggerJsdoc from 'swagger-jsdoc';

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'SolarSpot API',
      version: '1.0.0',
      description:
        'REST API for SolarSpot — a solar charging station finder. SE3040 Assignment 2026.',
      contact: {
        name: 'SolarSpot Team',
        email: 'team@solarspot.app',
      },
    },
    servers: [
      {
        url: 'http://localhost:5000',
        description: 'Local development (Docker / npm run dev)',
      },
      {
        url: 'https://solarspot-api.onrender.com',
        description: 'Production server (Render)',
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Enter your JWT access token',
        },
      },
      schemas: {
        ApiError: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            message: { type: 'string', example: 'Validation failed' },
            errors: { type: 'array', items: { type: 'string' } },
            statusCode: { type: 'integer', example: 400 },
          },
        },
        ApiSuccess: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            message: { type: 'string', example: 'Success' },
            data: { type: 'object' },
            timestamp: { type: 'string', format: 'date-time' },
          },
        },
        Pagination: {
          type: 'object',
          properties: {
            page: { type: 'integer', example: 1 },
            limit: { type: 'integer', example: 10 },
            total: { type: 'integer', example: 100 },
            totalPages: { type: 'integer', example: 10 },
            hasNext: { type: 'boolean', example: true },
            hasPrev: { type: 'boolean', example: false },
          },
        },
        // ── Weather / Solar Intelligence ─────────────────────────────────────
        WeatherData: {
          type: 'object',
          properties: {
            stationId:       { type: 'string', example: '507f1f77bcf86cd799439011' },
            fetchedAt:       { type: 'string', format: 'date-time' },
            temperature:     { type: 'number', example: 29.5, description: 'Celsius' },
            humidity:        { type: 'number', example: 78,   description: '0–100 %' },
            cloudCover:      { type: 'number', example: 25,   description: '0–100 %' },
            uvIndex:         { type: 'number', example: 5.2 },
            solarIrradiance: { type: 'number', example: 650,  description: 'Estimated W/m²' },
            solarIndex:      { type: 'string', enum: ['excellent','good','moderate','poor','unavailable'] },
            description:     { type: 'string', example: 'partly cloudy' },
            icon:            { type: 'string', example: '02d', description: 'OWM icon code' },
            windSpeed:       { type: 'number', example: 3.1,  description: 'm/s' },
          },
        },
        ForecastSlot: {
          type: 'object',
          properties: {
            timestamp:     { type: 'string', format: 'date-time' },
            temperature:   { type: 'number', example: 28.0 },
            cloudCover:    { type: 'number', example: 30 },
            uvIndex:       { type: 'number', example: 4.0 },
            solarIndex:    { type: 'string', enum: ['excellent','good','moderate','poor','unavailable'] },
            precipitation: { type: 'number', example: 1.0, description: 'mm (proxy from pop)' },
          },
        },
        BestTimeSlot: {
          type: 'object',
          properties: {
            date:       { type: 'string', example: '2026-03-01', description: 'Local date (UTC+5:30)' },
            startHour:  { type: 'integer', example: 10 },
            endHour:    { type: 'integer', example: 13 },
            solarIndex: { type: 'string', enum: ['excellent','good','moderate','poor','unavailable'] },
            reason:     { type: 'string', example: 'Excellent solar conditions — UV 8, 10% cloud cover' },
          },
        },
        HeatmapPoint: {
          type: 'object',
          properties: {
            stationId:  { type: 'string', example: '507f1f77bcf86cd799439011' },
            lat:        { type: 'number', example: 7.8 },
            lng:        { type: 'number', example: 80.7 },
            solarIndex: { type: 'string', enum: ['excellent','good','moderate','poor','unavailable'] },
            uvIndex:    { type: 'number', example: 4.0 },
            cloudCover: { type: 'number', example: 30 },
          },
        },
        // ── Solar Intelligence & Charging Analytics ────────────────────────
        WeatherSnapshot: {
          type: 'object',
          properties: {
            cloudCoverPct: { type: 'number', example: 25, description: '0–100 %' },
            uvIndex:       { type: 'number', example: 5.2 },
            temperatureC:  { type: 'number', example: 29.5 },
            windSpeedKph:  { type: 'number', example: 11.2 },
            weatherMain:   { type: 'string', example: 'Clouds' },
            weatherIcon:   { type: 'string', example: '02d' },
            capturedAt:    { type: 'string', format: 'date-time' },
            isFallback:    { type: 'boolean', example: false },
          },
        },
        SolarReport: {
          type: 'object',
          properties: {
            _id:               { type: 'string', example: '507f1f77bcf86cd799439011' },
            station:           { type: 'string', example: '507f1f77bcf86cd799439012' },
            submittedBy:       { type: 'string', example: '507f1f77bcf86cd799439013' },
            visitedAt:         { type: 'string', format: 'date-time' },
            weatherSnapshot:   { $ref: '#/components/schemas/WeatherSnapshot' },
            estimatedOutputKw: { type: 'number', example: 4.32, description: 'Server-calculated from weather + panel kW' },
            actualOutputKw:    { type: 'number', nullable: true, example: 4.1 },
            accuracyPct:       { type: 'number', nullable: true, example: 94.9, description: 'actual ÷ estimated × 100' },
            accuracyLabel:     { type: 'string', example: 'Excellent', description: 'Virtual field: Excellent / Good / Fair / Poor / Not measured' },
            solarScore:        { type: 'integer', minimum: 0, maximum: 10, example: 7 },
            notes:             { type: 'string', nullable: true, example: 'Panel was partially shaded by a tree' },
            status:            { type: 'string', enum: ['draft', 'published'] },
            isPublic:          { type: 'boolean', example: true },
            isActive:          { type: 'boolean', example: true },
            createdAt:         { type: 'string', format: 'date-time' },
            updatedAt:         { type: 'string', format: 'date-time' },
          },
        },
        CreateReportDto: {
          type: 'object',
          required: ['stationId'],
          properties: {
            stationId:      { type: 'string', example: '507f1f77bcf86cd799439012' },
            visitedAt:      { type: 'string', format: 'date-time', description: 'Defaults to now' },
            actualOutputKw: { type: 'number', nullable: true, minimum: 0, maximum: 500 },
            notes:          { type: 'string', nullable: true, maxLength: 1000 },
            isPublic:       { type: 'boolean', default: true },
          },
        },
        UpdateReportDto: {
          type: 'object',
          minProperties: 1,
          properties: {
            actualOutputKw: { type: 'number', nullable: true, minimum: 0, maximum: 500 },
            notes:          { type: 'string', nullable: true, maxLength: 1000 },
            isPublic:       { type: 'boolean' },
          },
        },
        LiveWeatherResponse: {
          type: 'object',
          properties: {
            stationId:         { type: 'string' },
            stationName:       { type: 'string', example: 'Colombo Solar Hub' },
            solarPanelKw:      { type: 'number', example: 5.5 },
            weather:           { $ref: '#/components/schemas/WeatherSnapshot' },
            estimatedOutputKw: { type: 'number', example: 4.32 },
            solarScore:        { type: 'integer', minimum: 0, maximum: 10, example: 7 },
          },
        },
        ForecastWithSolarResponse: {
          type: 'object',
          properties: {
            stationId:    { type: 'string' },
            stationName:  { type: 'string' },
            solarPanelKw: { type: 'number' },
            forecast: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  dt:               { type: 'string', format: 'date-time' },
                  cloudCoverPct:    { type: 'number' },
                  temperatureC:     { type: 'number' },
                  windSpeedKph:     { type: 'number' },
                  weatherMain:      { type: 'string' },
                  weatherIcon:      { type: 'string' },
                  uvIndex:          { type: 'number' },
                  estimatedOutputKw: { type: 'number' },
                  solarScore:       { type: 'integer' },
                },
              },
            },
            bestWindows: {
              type: 'array',
              maxItems: 3,
              items: {
                type: 'object',
                properties: {
                  dt:               { type: 'string', format: 'date-time' },
                  estimatedOutputKw: { type: 'number' },
                  solarScore:       { type: 'integer' },
                  cloudCoverPct:    { type: 'number' },
                  weatherMain:      { type: 'string' },
                  weatherIcon:      { type: 'string' },
                  label:            { type: 'string', enum: ['Best', 'Good', 'Acceptable'] },
                },
              },
            },
          },
        },
        StationAnalytics: {
          type: 'object',
          properties: {
            hasData:              { type: 'boolean', example: true },
            reportCount:          { type: 'integer', example: 42 },
            avgSolarScore:        { type: 'number', example: 6.8 },
            avgAccuracyPct:       { type: 'number', nullable: true, example: 91.2 },
            avgEstimatedOutputKw: { type: 'number', example: 4.1 },
            avgActualOutputKw:    { type: 'number', nullable: true, example: 3.95 },
            last30Days: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  _id:         { type: 'string', example: '2026-02-27', description: 'YYYY-MM-DD' },
                  avgScore:    { type: 'number', example: 7.2 },
                  reportCount: { type: 'integer', example: 3 },
                },
              },
            },
          },
        },
      },
      responses: {
        ValidationError: {
          description: 'Request body / query failed validation',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ApiError' },
              example: {
                success: false,
                message: 'Validation failed',
                errors: ['name is required', 'solarPanelKw must be a number'],
                statusCode: 422,
              },
            },
          },
        },
        Unauthorized: {
          description: 'Missing or invalid access token',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ApiError' },
              example: { success: false, message: 'Access token required', statusCode: 401 },
            },
          },
        },
        Forbidden: {
          description: 'Insufficient permissions',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ApiError' },
              example: { success: false, message: 'Forbidden', statusCode: 403 },
            },
          },
        },
        NotFound: {
          description: 'Resource not found',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ApiError' },
              example: { success: false, message: 'Resource not found', statusCode: 404 },
            },
          },
        },
      },
    },
    security: [{ bearerAuth: [] }],
  },
  // Scan both routes and controller files — some modules co-locate @swagger JSDoc
  // in the controller (weather, auth, users, permissions); stations uses routes.
  apis: ['./src/modules/**/*.routes.ts', './src/modules/**/*.controller.ts'],
};

export const swaggerSpec = swaggerJsdoc(options);
