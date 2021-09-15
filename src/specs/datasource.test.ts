import moment from 'moment';
import { BigQueryDatasource } from '../datasource';

let responseMock = { data: {}, status: 200 };

const mockResponse = (data, status: number = 200) => {
  responseMock = { data, status };
};

const restoreResponseMock = () => {
  responseMock = { data: {}, status: 200 };
};

const templateSrvMock = {
  replace: jest.fn(text => text),
};

jest.mock('@grafana/runtime', () => ({
  ...((jest.requireActual('@grafana/runtime') as unknown) as object),
  getBackendSrv: () => ({
    datasourceRequest: () => {
      return Promise.resolve(responseMock);
    },
  }),
  getTemplateSrv: () => templateSrvMock,
}));

describe('BigQueryDatasource', () => {
  afterEach(() => {
    restoreResponseMock();
  });

  const instanceSettings = {
    name: 'bigquery',
    jsonData: {
      authenticationType: 'jwt',
      sendUsageData: false,
    },
  };
  const backendSrv = {};

  const raw = {
    from: moment.utc('2018-04-25 10:00'),
    to: moment.utc('2018-04-25 11:00'),
  };

  const ctx = {
    timeSrvMock: {
      timeRange: () => ({
        from: raw.from,
        to: raw.to,
        raw,
      }),
    },
  } as any;

  beforeEach(() => {
    ctx.ds = new BigQueryDatasource(instanceSettings, {});
    ctx.ds.projectName = 'my project';
  });

  describe('metricFindQuery', () => {
    const query = '',
      options = { variable: { name: 'refId' } };
    it('should check response for empty query', async () => {
      const res = await ctx.ds.metricFindQuery(query, options);
      expect(res).toEqual([{ data: [] }]);
    });
  });

  describe('When performing do request', () => {
    let results;

    beforeEach(() => {
      mockResponse({
        kind: 'bigquery#queryResponse',
        schema: {
          fields: [
            {
              name: 'time',
              type: 'TIMESTAMP',
              mode: 'NULLABLE',
            },
            {
              name: 'start_station_latitude',
              type: 'FLOAT',
              mode: 'NULLABLE',
            },
          ],
        },
        jobReference: {
          projectId: 'aviv-playground',
          jobId: 'job_fB4qCDAO-TKg1Orc-OrkdIRxCGN5',
          location: 'US',
        },
        totalRows: '3',
        rows: [
          {
            f: [
              {
                v: '1.521578851E9',
              },
              {
                v: '37.7753058',
              },
            ],
          },
          {
            f: [
              {
                v: '1.521578916E9',
              },
              {
                v: '37.3322326',
              },
            ],
          },
          {
            f: [
              {
                v: '1.521578927E9',
              },
              {
                v: '37.781752',
              },
            ],
          },
        ],
        totalBytesProcessed: '23289520',
        jobComplete: true,
        cacheHit: false,
      });
    });

    it('should return expected data', async () => {
      await ctx.ds.doQuery('select * from table', 'id-1').then(data => {
        results = data;
      });
      expect(results.rows.length).toBe(3);
      expect(results.schema.fields.length).toBe(2);
    });

    it('should return expected data batch api', async () => {
      const priority = 'BATCH';
      await ctx.ds.doQuery('select * from table', 'id-1', priority).then(data => {
        results = data;
      });
      expect(results.rows.length).toBe(3);
      expect(results.schema.fields.length).toBe(2);
    });
    it('should return expected data interactive', async () => {
      const priority = 'INTERACTIVE';
      await ctx.ds.doQuery('select * from table', 'id-1', priority).then(data => {
        results = data;
      });
      expect(results.rows.length).toBe(3);
      expect(results.schema.fields.length).toBe(2);
    });

    it('should return expected data interactive', async () => {
      const priority = 'INTERACTIVE';
      await ctx.ds.doQueryRequest('select * from table', 'id-1', priority).then(data => {
        results = data;
      });
      expect(results.data.rows.length).toBe(3);
      expect(results.data.schema.fields.length).toBe(2);
    });
  });

  describe('_waitForJobComplete', () => {
    let results;

    const queryResults = {
      data: {
        totalBytesProcessed: '23289520',
        jobComplete: false,
        cacheHit: false,
      },
    };
    beforeEach(() => {
      mockResponse({
        kind: 'bigquery#queryResponse',
        schema: {
          fields: [
            {
              name: 'time',
              type: 'TIMESTAMP',
              mode: 'NULLABLE',
            },
            {
              name: 'start_station_latitude',
              type: 'FLOAT',
              mode: 'NULLABLE',
            },
          ],
        },
        jobReference: {
          projectId: 'aviv-playground',
          jobId: 'job_fB4qCDAO-TKg1Orc-OrkdIRxCGN5',
          location: 'US',
        },
        totalRows: '3',
        rows: [
          {
            f: [
              {
                v: '1.521578851E9',
              },
              {
                v: '37.7753058',
              },
            ],
          },
          {
            f: [
              {
                v: '1.521578916E9',
              },
              {
                v: '37.3322326',
              },
            ],
          },
          {
            f: [
              {
                v: '1.521578927E9',
              },
              {
                v: '37.781752',
              },
            ],
          },
        ],
        totalBytesProcessed: '23289520',
        jobComplete: true,
        cacheHit: false,
      });
    });

    it('should return expected data', async () => {
      await ctx.ds._waitForJobComplete(queryResults, 'requestId', 'job_fB4qCDAO-TKg1Orc-OrkdIRxCGN5').then(data => {
        results = data;
      });
      expect(results.data.rows.length).toBe(3);
      expect(results.data.schema.fields.length).toBe(2);
    });
  });

  describe('_getQueryResults', () => {
    let results;
    const response = {
      kind: 'bigquery#queryResponse',
      schema: {
        fields: [
          {
            name: 'time',
            type: 'TIMESTAMP',
            mode: 'NULLABLE',
          },
          {
            name: 'start_station_latitude',
            type: 'FLOAT',
            mode: 'NULLABLE',
          },
        ],
      },
      jobReference: {
        projectId: 'aviv-playground',
        jobId: 'job_fB4qCDAO-TKg1Orc-OrkdIRxCGN5',
        location: 'US',
      },
      totalRows: '3',
      rows: [
        {
          f: [
            {
              v: '1.521578851E9',
            },
            {
              v: '37.7753058',
            },
          ],
        },
        {
          f: [
            {
              v: '1.521578916E9',
            },
            {
              v: '37.3322326',
            },
          ],
        },
        {
          f: [
            {
              v: '1.521578927E9',
            },
            {
              v: '37.781752',
            },
          ],
        },
      ],
      totalBytesProcessed: '23289520',
      jobComplete: true,
      cacheHit: false,
    };
    const queryResults = {
      data: {
        pageToken: 'token;',
        kind: 'bigquery#queryResponse',
        schema: {
          fields: [
            {
              name: 'time',
              type: 'TIMESTAMP',
              mode: 'NULLABLE',
            },
            {
              name: 'start_station_latitude',
              type: 'FLOAT',
              mode: 'NULLABLE',
            },
          ],
        },
        jobReference: {
          projectId: 'aviv-playground',
          jobId: 'job_fB4qCDAO-TKg1Orc-OrkdIRxCGN5',
          location: 'US',
        },
        totalRows: '3',
        rows: [
          {
            f: [
              {
                v: '1.521578851E9',
              },
              {
                v: '37.7753058',
              },
            ],
          },
          {
            f: [
              {
                v: '1.521578916E9',
              },
              {
                v: '37.3322326',
              },
            ],
          },
          {
            f: [
              {
                v: '1.521578927E9',
              },
              {
                v: '37.781752',
              },
            ],
          },
        ],
        totalBytesProcessed: '23289520',
        jobComplete: true,
        cacheHit: false,
      },
    };

    beforeEach(() => {
      mockResponse(response);
    });

    it('should return expected data', async () => {
      await ctx.ds
        ._getQueryResults(queryResults, response.rows, 'requestId', 'job_fB4qCDAO-TKg1Orc-OrkdIRxCGN5')
        .then(data => {
          results = data;
        });
      expect(results.length).toBe(6);
    });
  });

  describe('When performing getProjects', () => {
    let queryResults;

    beforeEach(async () => {
      mockResponse({
        kind: 'bigquery#projectList',
        etag: 'o48iuUgjDrXb++kcLl2yeQ==',
        projects: [
          {
            kind: 'bigquery#project',
            id: 'prj-1',
            numericId: '1',
            projectReference: {
              projectId: 'prj-1',
            },
            friendlyName: 'prj-1',
          },
          {
            kind: 'bigquery#project',
            id: 'prj-2',
            numericId: '2',
            projectReference: {
              projectId: 'prj-2',
            },
            friendlyName: 'prj-2',
          },
          {
            kind: 'bigquery#project',
            id: 'prj-3',
            numericId: '3',
            projectReference: {
              projectId: 'prj-3',
            },
            friendlyName: 'prj-3',
          },
        ],
        totalItems: 3,
      });
      await ctx.ds.getProjects().then(data => {
        queryResults = data;
      });
    });

    it('should return list of projects', () => {
      expect(queryResults.length).toBe(3);
      expect(queryResults[0].text).toBe('prj-1');
      expect(queryResults[2].text).toBe('prj-3');
    });
  });

  describe('When performing getDatasets', () => {
    let results;

    beforeEach(async () => {
      mockResponse({
        kind: 'bigquery#datasetList',
        etag: 'q6TrWWJHEC7v8Vt1T4+geg==',
        datasets: [
          {
            kind: 'bigquery#dataset',
            id: 'prj-1:ds-1',
            datasetReference: {
              datasetId: 'ds-1',
              projectId: 'prj-1',
            },
            location: 'US',
          },
          {
            kind: 'bigquery#dataset',
            id: 'prj-1:ds-2',
            datasetReference: {
              datasetId: 'ds-2',
              projectId: 'prj-1',
            },
            labels: {
              otag: 'ds-2',
            },
            location: 'US',
          },
        ],
      });
      await ctx.ds.getDatasets('prj-1').then(data => {
        results = data;
      });
    });

    it('should return list of datasets', () => {
      expect(results.length).toBe(2);
      expect(results[0].text).toBe('ds-1');
      expect(results[1].text).toBe('ds-2');
    });
  });

  describe('When performing getTables', () => {
    let results;

    beforeEach(async () => {
      mockResponse({
        kind: 'bigquery#tableList',
        etag: 'Qfgo3cWRRPb3c+XmsrC+OA==',
        tables: [
          {
            kind: 'bigquery#table',
            id: 'prj-1:ds-1.click_64',
            tableReference: {
              projectId: 'prj-1',
              datasetId: 'ds-1',
              tableId: 'click_64',
            },
            type: 'TABLE',
            creationTime: '1525943213994',
          },
          {
            kind: 'bigquery#table',
            id: 'prj-1:ds-1.error',
            tableReference: {
              projectId: 'prj-1',
              datasetId: 'ds-1',
              tableId: 'error',
            },
            type: 'TABLE',
            creationTime: '1525941785282',
          },
        ],
        totalItems: 2,
      });
      await ctx.ds.getTables('prj-1', 'ds-1').then(data => {
        results = data;
      });
    });

    it('should return list of tabels', () => {
      expect(results.length).toBe(2);
      expect(results[0].text).toBe('click_64');
      expect(results[1].text).toBe('error');
    });
  });

  describe('When performing getTableFields for Date Fields', () => {
    let results;

    beforeEach(async () => {
      mockResponse({
        kind: 'bigquery#table',
        etag: '3UHbvhc/35v2P8ZhsjrRtw==',
        id: 'ds-1:ds-1.newtable',
        selfLink: 'https://content.googleapis.com/bigquery/v2/projects/ds-1/datasets/ds-1/tables/newtable',
        tableReference: {
          projectId: 'ds-1',
          datasetId: 'ds-1',
          tableId: 'newtable',
        },
        description: 'a table partitioned by transaction_date',
        schema: {
          fields: [
            {
              name: 'transaction_id',
              type: 'INTEGER',
            },
            {
              name: 'transaction_date',
              type: 'DATE',
            },
            {
              name: 'My_datetime',
              type: 'DATETIME',
            },
            {
              name: 'My_Timestamp',
              type: 'TIMESTAMP',
            },
            {
              name: 'My_STRING',
              type: 'STRING',
            },
          ],
        },
        timePartitioning: {
          type: 'DAY',
          expirationMs: '259200000',
          field: 'transaction_date',
        },
        numBytes: '0',
        numLongTermBytes: '0',
        numRows: '0',
        creationTime: '1551211795415',
        lastModifiedTime: '1551623603909',
        type: 'TABLE',
        location: 'US',
      });

      await ctx.ds.getTableFields('prj-1', 'ds-1', 'newtable', ['DATE', 'TIMESTAMP', 'DATETIME']).then(data => {
        results = data;
      });
    });

    it('should return list of dare fields', () => {
      expect(results.length).toBe(3);
      expect(results[0].text).toBe('transaction_date');
      expect(results[1].text).toBe('My_datetime');
      expect(results[2].text).toBe('My_Timestamp');
    });
  });

  describe('When performing getTableFields for Numeric Fields', () => {
    let results;

    beforeEach(async () => {
      mockResponse({
        kind: 'bigquery#table',
        etag: '3UHbvhc/35v2P8ZhsjrRtw==',
        id: 'ds-1:ds-1.newtable',
        selfLink: 'https://content.googleapis.com/bigquery/v2/projects/ds-1/datasets/ds-1/tables/newtable',
        tableReference: {
          projectId: 'ds-1',
          datasetId: 'ds-1',
          tableId: 'newtable',
        },
        description: 'a table partitioned by transaction_date',
        schema: {
          fields: [
            {
              name: 'transaction_id',
              type: 'INTEGER',
            },
            {
              name: 'transaction_date',
              type: 'DATE',
            },
            {
              name: 'My_datetime',
              type: 'DATETIME',
            },
            {
              name: 'My_Timestamp',
              type: 'TIMESTAMP',
            },
            {
              name: 'My_STRING',
              type: 'STRING',
            },
            {
              name: 'My_FLOAT',
              type: 'FLOAT64',
            },
          ],
        },
        timePartitioning: {
          type: 'DAY',
          expirationMs: '259200000',
          field: 'transaction_date',
        },
        numBytes: '0',
        numLongTermBytes: '0',
        numRows: '0',
        creationTime: '1551211795415',
        lastModifiedTime: '1551623603909',
        type: 'TABLE',
        location: 'US',
      });

      await ctx.ds
        .getTableFields('prj-1', 'ds-1', 'newtable', ['INT64', 'NUMERIC', 'FLOAT64', 'FLOAT', 'INT', 'INTEGER'])
        .then(data => {
          results = data;
        });
    });

    it('should return list of numeric', () => {
      expect(results.length).toBe(2);
      expect(results[0].text).toBe('transaction_id');
      expect(results[1].text).toBe('My_FLOAT');
    });
  });

  describe('When performing getTableFields for All Fields', () => {
    let results;

    beforeEach(async () => {
      mockResponse({
        kind: 'bigquery#table',
        etag: '3UHbvhc/35v2P8ZhsjrRtw==',
        id: 'ds-1:ds-1.newtable',
        selfLink: 'https://content.googleapis.com/bigquery/v2/projects/ds-1/datasets/ds-1/tables/newtable',
        tableReference: {
          projectId: 'ds-1',
          datasetId: 'ds-1',
          tableId: 'newtable',
        },
        description: 'a table partitioned by transaction_date',
        schema: {
          fields: [
            {
              name: 'transaction_id',
              type: 'INTEGER',
            },
            {
              name: 'transaction_date',
              type: 'DATE',
            },
            {
              name: 'My_datetime',
              type: 'DATETIME',
            },
            {
              name: 'My_Timestamp',
              type: 'TIMESTAMP',
            },
            {
              name: 'My_STRING',
              type: 'STRING',
            },
            {
              name: 'My_FLOAT',
              type: 'FLOAT64',
            },
          ],
        },
        timePartitioning: {
          type: 'DAY',
          expirationMs: '259200000',
          field: 'transaction_date',
        },
        numBytes: '0',
        numLongTermBytes: '0',
        numRows: '0',
        creationTime: '1551211795415',
        lastModifiedTime: '1551623603909',
        type: 'TABLE',
        location: 'US',
      });

      await ctx.ds.getTableFields('prj-1', 'ds-1', 'newtable', []).then(data => {
        results = data;
      });
    });

    it('should return list of all fields', () => {
      expect(results.length).toBe(6);
      expect(results[0].text).toBe('transaction_id');
      expect(results[5].text).toBe('My_FLOAT');
    });
  });

  describe('When interpolating variables', () => {
    beforeEach(() => {
      ctx.variable = {};
    });

    describe('and value is a string', () => {
      it('should return an unquoted value', () => {
        expect(ctx.ds.interpolateVariable('abc', ctx.variable)).toEqual('abc');
      });
    });
    describe('and value is a number', () => {
      it('should return an unquoted value', () => {
        expect(ctx.ds.interpolateVariable(1000, ctx.variable)).toEqual(1000);
      });
    });
    describe('and value is an array of strings', () => {
      it('should return comma separated quoted values', () => {
        expect(ctx.ds.interpolateVariable(['a', 'b', 'c'], ctx.variable)).toEqual("'a','b','c'");
      });
    });

    describe('and variable allows multi-value and is a string', () => {
      it('should return a quoted value', () => {
        ctx.variable.multi = true;
        expect(ctx.ds.interpolateVariable('abc', ctx.variable)).toEqual("'abc'");
      });
    });

    describe('and variable contains single quote', () => {
      it('should return a quoted value', () => {
        ctx.variable.multi = true;
        expect(ctx.ds.interpolateVariable("a'bc", ctx.variable)).toEqual("'a''bc'");
        expect(ctx.ds.interpolateVariable("a'b'c", ctx.variable)).toEqual("'a''b''c'");
      });
    });

    describe('and variable allows all and is a string', () => {
      it('should return a quoted value', () => {
        ctx.variable.includeAll = true;
        expect(ctx.ds.interpolateVariable('abc', ctx.variable)).toEqual("'abc'");
      });
    });
  });

  describe('annotationQuery', () => {
    beforeEach(() => {
      mockResponse({
        kind: 'bigquery#queryResponse',
        schema: {
          fields: [
            {
              name: 'time',
              type: 'TIMESTAMP',
              mode: 'NULLABLE',
            },
            {
              name: 'text',
              type: 'STRING',
              mode: 'NULLABLE',
            },
            {
              name: 'tags',
              type: 'STRING',
              mode: 'NULLABLE',
            },
          ],
        },
        jobReference: {
          projectId: 'proj-1',
          jobId: 'job_fB4qCDAO-TKg1Orc-OrkdIRxCGN5',
          location: 'US',
        },
        totalRows: '2',
        rows: [
          {
            f: [{ v: 1 }, { v: 'text1' }, { v: 'tags1' }],
          },
          {
            f: [{ v: 2 }, { v: 'text2' }, { v: 'tags2' }],
          },
        ],
        totalBytesProcessed: '23289520',
        jobComplete: true,
        cacheHit: false,
      });
    });

    const options = {
      annotation: {
        name: 'Annotation test name',
        rawQuery: `select x from y where z`,
      },
      scopedVars: {
        __interval: {
          text: '600000',
          value: 600000,
        },
      },
      range: {
        from: moment.utc('2018-04-25 10:00'),
        to: moment.utc('2018-04-25 11:00'),
      },
    };

    it('should return expected data', async () => {
      const expectedResult = [
        {
          annotation: { name: 'Annotation test name', rawQuery: 'select x from y where z' },
          tags: ['tags1'],
          text: 'text1',
          time: 1000,
        },
        {
          annotation: { name: 'Annotation test name', rawQuery: 'select x from y where z' },
          tags: ['tags2'],
          text: 'text2',
          time: 2000,
        },
      ];
      const res = await ctx.ds.annotationQuery(options);

      expect(res).toEqual(expectedResult);
      expect(res.length).toBe(expectedResult.length);
    });
  });

  describe('When performing testDatasource', () => {
    let results;
    beforeEach(() => {
      mockResponse({
        kind: 'bigquery#datasetList',
        etag: 'q6TrWWJHEC7v8Vt1T4+geg==',
        datasets: [
          {
            kind: 'bigquery#dataset',
            id: 'prj-1:ds-1',
            datasetReference: {
              datasetId: 'ds-1',
              projectId: 'prj-1',
            },
            location: 'US',
          },
          {
            kind: 'bigquery#dataset',
            id: 'prj-1:ds-2',
            datasetReference: {
              datasetId: 'ds-2',
              projectId: 'prj-1',
            },
            labels: {
              otag: 'ds-2',
            },
            location: 'US',
          },
        ],
      });
    });

    it('should test datasource', async () => {
      await ctx.ds.testDatasource().then(data => {
        results = data;
      });
      expect(results.status).toBe('success');
    });
  });

  describe('When performing testDatasource', () => {
    let results;

    beforeEach(() => {
      mockResponse({
        kind: 'bigquery#datasetList',
        etag: 'q6TrWWJHEC7v8Vt1T4+geg==',
        datasets: [
          {
            kind: 'bigquery#dataset',
            id: 'prj-1:ds-1',
            datasetReference: {
              datasetId: 'ds-1',
              projectId: 'prj-1',
            },
            location: 'US',
          },
          {
            kind: 'bigquery#dataset',
            id: 'prj-1:ds-2',
            datasetReference: {
              datasetId: 'ds-2',
              projectId: 'prj-1',
            },
            labels: {
              otag: 'ds-2',
            },
            location: 'US',
          },
        ],
      });
    });

    it('should return  default projects', () => {
      results = ctx.ds.getDefaultProject();
    });

    expect(results).toBe(undefined);
  });
});
