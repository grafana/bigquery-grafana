import _ from 'lodash';
// eslint-disable-next-line no-restricted-imports
import BigQueryQuery, { BigQueryQueryNG } from './bigquery_query';
import { map } from 'rxjs/operators';
import ResponseParser, { ResultFormat } from './ResponseParser';
import { BigQueryOptions, GoogleAuthType, QueryFormat, QueryPriority } from './types';
import { v4 as generateID } from 'uuid';
import {
  DataQueryRequest,
  DataQueryResponse,
  DataSourceApi,
  DataSourceInstanceSettings,
  dateTime,
  VariableModel,
} from '@grafana/data';
import { FetchResponse, getBackendSrv, getTemplateSrv } from '@grafana/runtime';
import {
  convertToUtc,
  createTimeShiftQuery,
  extractFromClause,
  findTimeField,
  formatBigqueryError,
  formatDateToString,
  getShiftPeriod,
  handleError,
  quoteLiteral,
  setupTimeShiftQuery,
  updatePartition,
  updateTableSuffix,
  SHIFTED,
} from 'utils';

function sleep(ms: number) {
  return new Promise(resolve => {
    setTimeout(resolve, ms);
  });
}

export class BigQueryDatasource extends DataSourceApi<any, BigQueryOptions> {
  private readonly baseUrl: string;
  private readonly url?: string;

  private runInProject: string;
  private jsonData: BigQueryOptions;
  private responseParser: ResponseParser;
  private queryModel: BigQueryQuery;
  private processingLocation?: string;
  private queryPriority?: QueryPriority;

  authenticationType: string;
  projectName: string = '';

  constructor(instanceSettings: DataSourceInstanceSettings<BigQueryOptions>) {
    super(instanceSettings);

    this.baseUrl = `/bigquery/`;
    this.url = instanceSettings.url;
    debugger;
    this.responseParser = new ResponseParser();
    this.queryModel = new BigQueryQuery({} as any);

    this.jsonData = instanceSettings.jsonData;
    this.authenticationType = instanceSettings.jsonData.authenticationType || GoogleAuthType.JWT;

    (async () => {
      this.projectName = instanceSettings.jsonData.defaultProject || (await this.getDefaultProject());
    })();

    this.runInProject =
      this.jsonData.flatRateProject && this.jsonData.flatRateProject.length
        ? this.jsonData.flatRateProject
        : this.projectName;

    this.processingLocation =
      this.jsonData.processingLocation && this.jsonData.processingLocation.length
        ? this.jsonData.processingLocation
        : undefined;

    this.queryPriority = this.jsonData.queryPriority;
  }

  async query(options: DataQueryRequest<BigQueryQueryNG>): Promise<DataQueryResponse> {
    const queries = _.filter(options.targets, target => {
      return target.hide !== true;
    }).map(target => {
      const queryModel = new BigQueryQuery(target, options.scopedVars);
      this.queryModel = queryModel;

      return {
        queryPriority: this.queryPriority,
        datasourceId: this.id,
        format: target.format,
        intervalMs: options.intervalMs,
        maxDataPoints: options.maxDataPoints,
        metricColumn: target.metricColumn,
        partitioned: target.partitioned,
        partitionedField: target.partitionedField,
        rawSql: queryModel.render(true),
        refId: target.refId,
        sharded: target.sharded,
        table: target.table,
        timeColumn: target.timeColumn,
        timeColumnType: target.timeColumnType,
      };
    });

    if (queries.length === 0) {
      return Promise.resolve({ data: [] });
    }

    _.map(queries, query => {
      const newQuery = createTimeShiftQuery(query);
      if (newQuery) {
        queries.push(newQuery);
      }
    });

    let modOptions;
    const allQueryPromise = _.map(queries, query => {
      const tmpQ = this.queryModel.target.rawSql;

      if (this.queryModel.target.rawQuery === false) {
        this.queryModel.target.metricColumn = query.metricColumn;
        this.queryModel.target.partitioned = query.partitioned;
        this.queryModel.target.partitionedField = query.partitionedField;
        this.queryModel.target.rawSql = query.rawSql;
        this.queryModel.target.sharded = query.sharded;
        this.queryModel.target.table = query.table;
        this.queryModel.target.timeColumn = query.timeColumn;
        this.queryModel.target.timeColumnType = query.timeColumnType;
        modOptions = setupTimeShiftQuery(query, options);

        const q = this.setUpQ(modOptions, options, query);

        console.log(q);
        this.queryModel.target.rawSql = q;

        // TODO: get rid of !
        return this.doQuery(q!, options.panelId + query.refId, query.queryPriority).then(response => {
          return ResponseParser.parseDataQuery(response, query.format);
        });
      } else {
        // Fix raw sql
        const sqlWithNoVariables = getTemplateSrv().replace(tmpQ, options.scopedVars, this.interpolateVariable);
        const [project, dataset, table] = extractFromClause(sqlWithNoVariables);

        if (!project || !dataset || !table) {
          console.error(`Unable to extract project, dataset, or table from query: ${sqlWithNoVariables}`);
        }

        // TODO: fix the !
        this.getDateFields(project!, dataset!, table!)
          .then(dateFields => {
            const tm = findTimeField(tmpQ, dateFields);
            this.queryModel.target.timeColumn = tm.text;
            this.queryModel.target.timeColumnType = tm.value;
            this.queryModel.target.table = table;
          })
          .catch(err => {
            console.log(err);
          });
        this.queryModel.target.rawSql = query.rawSql;
        modOptions = setupTimeShiftQuery(query, options);
        const q = this.setUpQ(modOptions, options, query);

        // TODO: get rid of !
        return this.doQuery(q!, options.panelId + query.refId, query.queryPriority).then(response => {
          return ResponseParser.parseDataQuery(response, query.format);
        });
      }
    });

    return Promise.all(allQueryPromise).then((responses): any => {
      const data = [];
      if (responses) {
        for (const response of responses) {
          if ((response as any).type && (response as any).type === 'table') {
            data.push(response);
          } else {
            for (const dp of response as any) {
              data.push(dp);
            }
          }
        }
      }

      debugger;
      for (const d of data) {
        if (typeof d.target !== 'undefined' && d.target.search(SHIFTED) > -1) {
          const res = getShiftPeriod(d.target.substring(d.target.lastIndexOf('_') + 1, d.target.length));

          const shiftPeriod = res[0];
          const shiftVal = parseInt(res[1], 10);

          debugger;
          for (let i = 0; i < d.datapoints.length; i++) {
            d.datapoints[i][1] = dateTime(d.datapoints[i][1])
              .subtract(shiftVal, shiftPeriod)
              .valueOf();
          }
        }
      }

      return { data };
    });
  }

  async metricFindQuery(query: string, optionalOptions: any) {
    let refId = 'tempvar';
    if (optionalOptions && optionalOptions.variable && optionalOptions.variable.name) {
      refId = optionalOptions.variable.name;
    }

    const interpolatedQuery = {
      datasourceId: this.id,
      format: 'table',
      rawSql: getTemplateSrv().replace(query, {}, this.interpolateVariable),
      refId,
    };

    return await this.doQuery(interpolatedQuery.rawSql, refId).then(metricData => {
      if (!metricData.rows) {
        return [];
      }
      return ResponseParser.toVar(metricData);
    });
  }

  async testDatasource() {
    let status = 'success';
    let message = 'Successfully queried the BigQuery API.';
    const defaultErrorMessage = 'Cannot connect to BigQuery API';

    if (!this.projectName) {
      await this.getDefaultProject();
    }

    try {
      const path = `v2/projects/${this.projectName}/datasets`;
      const response = await this.doRequest(`${this.baseUrl}${path}`);
      if (response.status !== 200) {
        status = 'error';
        message = response.statusText ? response.statusText : defaultErrorMessage;
      }
    } catch (error) {
      message = (error as any).statusText ? (error as any).statusText : defaultErrorMessage;
    }

    try {
      const path = `v2/projects/${this.projectName}/jobs/no-such-jobs`;
      const response = await this.doRequest(`${this.baseUrl}${path}`);
      if (response.status !== 200) {
        status = 'error';
        message = response.statusText ? response.statusText : defaultErrorMessage;
      }
    } catch (error) {
      if ((error as any).status !== 404) {
        message = (error as any).statusText ? (error as any).statusText : defaultErrorMessage;
      }
    }
    return {
      message,
      status,
    };
  }

  async getProjects(): Promise<ResultFormat[]> {
    const path = `v2/projects`;
    const data = await this.paginatedResults(path, 'projects');
    return ResponseParser.parseProjects(data);
  }

  async getDatasets(projectName: string): Promise<ResultFormat[]> {
    const path = `v2/projects/${projectName}/datasets`;
    const data = await this.paginatedResults(path, 'datasets');
    return ResponseParser.parseDatasets(data);
  }

  async getTables(projectName: string, datasetName: string): Promise<ResultFormat[]> {
    const path = `v2/projects/${projectName}/datasets/${datasetName}/tables`;
    const data = await this.paginatedResults(path, 'tables');
    return new ResponseParser().parseTabels(data);
  }

  async getTableFields(
    projectName: string,
    datasetName: string,
    tableName: string,
    filter: string[]
  ): Promise<ResultFormat[]> {
    const path = `v2/projects/${projectName}/datasets/${datasetName}/tables/${tableName}`;
    const data = await this.paginatedResults(path, 'schema.fields');
    return ResponseParser.parseTableFields(data, filter);
  }

  async getDateFields(projectName: string, datasetName: string, tableName: string) {
    return this.getTableFields(projectName, datasetName, tableName, ['DATE', 'TIMESTAMP', 'DATETIME']);
  }

  async getDefaultProject() {
    try {
      if (this.authenticationType === 'gce' || !this.projectName) {
        const data = await this.getProjects();
        this.projectName = data[0].value;
        if (!this.runInProject) {
          this.runInProject = this.projectName;
        }
        return data[0].value;
      } else {
        return this.projectName;
      }
    } catch (error) {
      return (this.projectName = '');
    }
  }

  async annotationQuery(options: any) {
    const path = `v2/projects/${this.runInProject}/queries`;
    const url = this.url + `${this.baseUrl}${path}`;
    if (!options.annotation.rawQuery) {
      return Promise.reject({
        message: 'Query missing in annotation definition',
      });
    }
    const rawSql = getTemplateSrv().replace(options.annotation.rawQuery, options.scopedVars, this.interpolateVariable);

    const query = {
      // datasourceId: this.id,
      format: QueryFormat.Table,
      rawSql,
      refId: options.annotation.name,
    } as BigQueryQueryNG;

    this.queryModel.target.rawSql = query.rawSql;
    query.rawSql = this.queryModel.expend_macros(options);

    return getBackendSrv()
      .fetch({
        data: {
          priority: this.queryPriority,
          from: options.range.from.valueOf().toString(),
          query: query.rawSql,
          to: options.range.to.valueOf().toString(),
          useLegacySql: false,
          useQueryCache: true,
        },
        method: 'POST',
        requestId: options.annotation.name,
        url,
      })
      .pipe(
        map(async (res: FetchResponse) => {
          const result = await this.responseParser.transformAnnotationResponse(options, res);
          return result;
        })
      )
      .toPromise();
  }

  private setUpQ(modOptions: any, options: DataQueryRequest<BigQueryQueryNG>, query: BigQueryQueryNG) {
    let q = this.queryModel.expend_macros(modOptions);

    if (q) {
      q = this.setUpPartition(q, Boolean(query.partitioned), query.partitionedField || '', modOptions);
      q = updatePartition(q, modOptions);
      q = updateTableSuffix(q, modOptions);

      if (query.refId.search(SHIFTED) > -1) {
        // TODO: get rid of !
        q = this._updateAlias(q!, modOptions, query.refId);
      }

      const limit = q?.match(/[^]+(\bLIMIT\b)/gi);

      if (limit == null) {
        const limitStatement = ' LIMIT ' + options.maxDataPoints;
        const limitPosition = q?.match(/\$__limitPosition/g);

        if (limitPosition !== null) {
          q = q?.replace(/\$__limitPosition/g, limitStatement);
        } else {
          q += limitStatement;
        }
      }
    }

    return q;
  }
  /**
   * Add partition to query unless it has one
   * @param query
   * @param isPartitioned
   * @param partitionedField
   * @param options
   */
  private setUpPartition(
    query: string,
    isPartitioned: boolean,
    partitionedField: string,
    options: DataQueryRequest<BigQueryQueryNG>
  ) {
    partitionedField = partitionedField ? partitionedField : '_PARTITIONTIME';

    if (isPartitioned && !query.match(new RegExp(partitionedField, 'i'))) {
      const fromD = convertToUtc(options.range.from.toDate());
      const toD = convertToUtc(options.range.to.toDate());

      const from = `${partitionedField} >= '${formatDateToString(fromD, '-', true)}'`;
      const to = `${partitionedField} < '${formatDateToString(toD, '-', true)}'`;
      const partition = `where ${from} AND ${to} AND `;
      if (query.match(/where/i)) {
        query = query.replace(/where/i, partition);
      } else {
        const reg = /from ('|`|"|){1}(.*?)('|`|"|){1} as ('|`|"|)(\S*)('|`|"|){1}|from ('|`|"|){1}(\S*)('|`|"|){1}/i;
        const fromMatch = query.match(reg);
        query = query.replace(reg, `${fromMatch} ${fromMatch}`);
      }
    }
    return query;
  }

  // @ts-ignore
  private async doRequest(url: string, requestId = 'requestId', maxRetries = 3) {
    return getBackendSrv()
      .fetch({
        method: 'GET',
        requestId: generateID(),
        url: this.url + url,
      })
      .toPromise()
      .then(result => {
        if (result.status !== 200) {
          if (result.status >= 500 && maxRetries > 0) {
            return this.doRequest(url, requestId, maxRetries - 1);
          }
          throw formatBigqueryError((result.data as any).error);
        }
        return result;
      })
      .catch(error => {
        if (maxRetries > 0) {
          return this.doRequest(url, requestId, maxRetries - 1);
        }
        if (error.cancelled === true) {
          return [];
        }
        return handleError(error);
      });
  }

  // @ts-ignore
  private async doQueryRequest(query: string, requestId: string, priority: QueryPriority, maxRetries = 3) {
    const location = this.queryModel.target.location || this.processingLocation || 'US';
    let data,
      queryiesOrJobs = 'queries';
    data = { priority: priority, location, query, useLegacySql: false, useQueryCache: true }; //ExternalDataConfiguration
    if (priority.toUpperCase() === 'BATCH') {
      queryiesOrJobs = 'jobs';
      data = { configuration: { query: { query, priority } } };
    }
    const path = `v2/projects/${this.runInProject}/${queryiesOrJobs}`;
    const url = this.url + `${this.baseUrl}${path}`;
    return getBackendSrv()
      .fetch({
        data: data,
        method: 'POST',
        requestId,
        url,
      })
      .toPromise()
      .then(result => {
        if (result.status !== 200) {
          if (result.status >= 500 && maxRetries > 0) {
            return this.doQueryRequest(query, requestId, priority, maxRetries - 1);
          }
          throw formatBigqueryError((result.data as any).error);
        }
        return result;
      })
      .catch(error => {
        if (maxRetries > 0) {
          return this.doQueryRequest(query, requestId, priority, maxRetries - 1);
        }
        if (error.cancelled === true) {
          return [];
        }
        return handleError(error);
      });
  }

  // @ts-ignore
  private async _waitForJobComplete(queryResults, requestId: string, jobId: string) {
    let sleepTimeMs = 100;
    const location = this.queryModel.target.location || this.processingLocation || 'US';
    const path = `v2/projects/${this.runInProject}/queries/` + jobId + '?location=' + location;
    while (!queryResults.data.jobComplete) {
      await sleep(sleepTimeMs);
      sleepTimeMs *= 2;
      queryResults = await this.doRequest(`${this.baseUrl}${path}`, requestId);
    }
    return queryResults;
  }

  // @ts-ignore
  private async _getQueryResults(queryResults, rows, requestId: string, jobId: string) {
    while (queryResults.data.pageToken) {
      const location = this.queryModel.target.location || this.processingLocation || 'US';
      const path =
        `v2/projects/${this.runInProject}/queries/` +
        jobId +
        '?pageToken=' +
        queryResults.data.pageToken +
        '&location=' +
        location;
      queryResults = await this.doRequest(`${this.baseUrl}${path}`, requestId);
      if (queryResults.length === 0) {
        return rows;
      }
      rows = rows.concat(queryResults.data.rows);
    }
    return rows;
  }

  private async doQuery(query: string, requestId: string, priority = QueryPriority.Interactive) {
    if (!query) {
      return {
        rows: null,
        schema: null,
      };
    }
    let notReady = false;
    ['-- time --', '-- value --'].forEach(element => {
      if (query.indexOf(element) !== -1) {
        notReady = true;
      }
    });
    if (notReady) {
      return {
        rows: null,
        schema: null,
      };
    }
    let queryResults = await this.doQueryRequest(
      //"tableDefinitions": {
      //   string: {
      //     object (ExternalDataConfiguration)
      //   },
      //   ...
      // },
      query,
      requestId,
      priority
    );
    if (queryResults.length === 0) {
      return {
        rows: null,
        schema: null,
      };
    }
    const jobId = queryResults.data.jobReference.jobId;
    queryResults = await this._waitForJobComplete(queryResults, requestId, jobId);
    if (queryResults.length === 0) {
      return {
        rows: null,
        schema: null,
      };
    }
    let rows = queryResults.data.rows;
    const schema = queryResults.data.schema;
    rows = await this._getQueryResults(queryResults, rows, requestId, jobId);
    return {
      rows,
      schema,
    };
  }

  private interpolateVariable = (value: any, variable: VariableModel) => {
    if (typeof value === 'string') {
      // @ts-ignore
      if (variable.multi || variable.includeAll) {
        return quoteLiteral(value);
      } else {
        return value;
      }
    }

    if (typeof value === 'number') {
      return value;
    }

    const quotedValues = _.map(value, v => {
      return quoteLiteral(v);
    });
    return quotedValues.join(',');
  };

  private async paginatedResults(path: string, dataName: string) {
    let queryResults = await this.doRequest(`${this.baseUrl}${path}`);
    let data = queryResults.data;
    if (!data) {
      return data;
    }
    const dataList = dataName.split('.');
    dataList.forEach(element => {
      if (data && data[element]) {
        data = data[element];
      }
    });
    while (queryResults && queryResults.data && queryResults.data.nextPageToken) {
      queryResults = await this.doRequest(`${this.baseUrl}${path}` + '?pageToken=' + queryResults.data.nextPageToken);
      dataList.forEach(element => {
        data = data.concat(queryResults.data[element]);
      });
    }
    return data;
  }

  private _updateAlias(q: string, options: any, shiftstr: string) {
    if (shiftstr !== undefined) {
      const index = shiftstr.search(SHIFTED);
      const shifted = shiftstr.substr(index, shiftstr.length);
      for (const al of options.targets[0].select[0]) {
        if (al.type === 'alias') {
          q = q.replace('AS ' + al.params[0], 'AS ' + al.params[0] + shifted);
          return q;
        }
      }
      const aliasshiftted = [options.targets[0].select[0][0].params[0] + shifted];
      const oldSelect = this.queryModel.buildValueColumn(options.targets[0].select[0]);
      const newSelect = this.queryModel.buildValueColumn([
        options.targets[0].select[0][0],
        options.targets[0].select[0][1],
        { type: 'alias', params: [aliasshiftted] },
      ]);
      q = q.replace(oldSelect, newSelect);
    }
    return q;
  }
}
