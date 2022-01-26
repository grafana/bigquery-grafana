import { DataQuery, DataSourceJsonData } from '@grafana/data';
import { BigQueryAPI } from 'api';
import {
  QueryEditorFunctionExpression,
  QueryEditorGroupByExpression,
  QueryEditorPropertyExpression,
} from 'expressions';
import { JsonTree } from 'react-awesome-query-builder';
import { applyQueryDefaults } from 'utils';

export enum GoogleAuthType {
  JWT = 'jwt',
  GCE = 'gce',
}

export enum QueryPriority {
  Interactive = 'INTERACTIVE',
  Batch = 'BATCH',
}

export enum EditorMode {
  'Builder',
  'Code',
}

export interface QueryRowFilter {
  filter: boolean;
  group: boolean;
  order: boolean;
  preview: boolean;
}

export interface BigQueryOptions extends DataSourceJsonData {
  authenticationType: GoogleAuthType;
  flatRateProject?: string;
  processingLocation?: string;
  queryPriority?: QueryPriority;
  tokenUri?: string;
  clientEmail?: string;
  defaultProject?: string;
}

export interface BigQuerySecureJsonData {
  privateKey?: string;
}

export enum GroupType {
  Time = 'time',
  Column = 'column',
}

export enum QueryFormat {
  Timeseries = 0,
  Table = 1,
}

export interface QueryModel extends DataQuery {
  rawSql: string;
  format: QueryFormat;
  connectionArgs: {
    dataset: string;
    table: string;
    location: string;
  };
}

export interface SQLExpression {
  columns?: QueryEditorFunctionExpression[];
  from?: string;
  whereJsonTree?: JsonTree;
  whereString?: string;
  groupBy?: QueryEditorGroupByExpression[];
  orderBy?: QueryEditorPropertyExpression;
  orderByDirection?: 'ASC' | 'DESC';
  limit?: number;
}

export interface ResourceSelectorProps {
  apiClient: BigQueryAPI;
  location: string;
  disabled?: boolean;
  className?: string;
  applyDefault?: boolean;
}
export interface BigQueryQueryNG extends DataQuery {
  dataset?: string;
  table?: string;

  format: QueryFormat;
  rawQuery?: boolean;
  rawSql: string;
  location?: string;

  orderByCol?: string;
  orderBySort?: string;
  timeColumn?: string;
  timeColumnType?: 'TIMESTAMP' | 'DATE' | 'DATETIME' | 'int4';
  metricColumn?: string;
  group?: Array<{ type: GroupType; params: string[] }>;
  where?: any[];
  select?: any[];
  partitioned?: boolean;
  partitionedField?: string;
  convertToUTC?: boolean;
  sharded?: boolean;
  queryPriority?: QueryPriority;
  timeShift?: string;
  editorMode?: EditorMode;
  sql?: SQLExpression;
}

export type QueryWithDefaults = ReturnType<typeof applyQueryDefaults>;
