import React, { useEffect, useState, useRef } from 'react';
import { GrafanaTheme2, QueryEditorProps, SelectableValue } from '@grafana/data';
import { BigQueryDatasource } from './datasource';
import { DEFAULT_REGION, PROCESSING_LOCATIONS, QUERY_FORMAT_OPTIONS } from './constants';
import {
  CustomScrollbar,
  Field,
  HorizontalGroup,
  JSONFormatter,
  Select,
  Tab,
  TabContent,
  TabsBar,
  Tooltip,
  useTheme2,
} from '@grafana/ui';
import { QueryEditorRaw } from './QueryEditorRaw';
import { DatasetSelector } from './components/DatasetSelector';
import { TableSelector } from './components/TableSelector';
import { BigQueryQueryNG } from './bigquery_query';
import { BigQueryOptions, QueryFormat } from './types';
import { getApiClient, TableFieldSchema } from './api';
import { useAsync, useAsyncFn } from 'react-use';

type Props = QueryEditorProps<BigQueryDatasource, BigQueryQueryNG, BigQueryOptions>;

function applyQueryDefaults(q: BigQueryQueryNG, ds: BigQueryDatasource) {
  const result = { ...q };

  result.dataset = q.dataset;
  result.location = q.location || ds.jsonData.defaultRegion || DEFAULT_REGION;
  result.format = q.format !== undefined ? q.format : QueryFormat.Table;
  result.rawSql = q.rawSql || '';

  return result;
}

const isQueryValid = (q: BigQueryQueryNG) => {
  return Boolean(q.location && q.dataset && q.table && q.rawSql);
};

export function QueryEditor(props: Props) {
  const schemaCache = useRef(new Map<string, { schema: TableFieldSchema[]; columns: string[] }>());
  const {
    loading: apiLoading,
    error: apiError,
    value: apiClient,
  } = useAsync(async () => await getApiClient(props.datasource.id), [props.datasource]);
  const [isSchemaOpen, setIsSchemaOpen] = useState(false);
  const theme: GrafanaTheme2 = useTheme2();

  const queryWithDefaults = applyQueryDefaults(props.query, props.datasource);

  const [fetchTableSchemaState, fetchTableSchema] = useAsyncFn(
    async (l?: string, d?: string, t?: string) => {
      if (!Boolean(l && d && t) || !apiClient) {
        return null;
      }

      if (schemaCache.current?.has(t!)) {
        return schemaCache.current?.get(t!);
      }
      const schema = await apiClient.getTableSchema(l!, d!, t!);
      const columns = await apiClient.getColumns(l!, d!, t!);
      const results = {
        schema: schema.schema || [],
        columns,
      };
      schemaCache.current.set(t!, results);
      return results;
    },
    [apiClient]
  );

  useEffect(() => {
    if (!queryWithDefaults.location || !queryWithDefaults.dataset || !queryWithDefaults.table) {
      return;
    }
    fetchTableSchema(queryWithDefaults.location, queryWithDefaults.dataset, queryWithDefaults.table);
  }, [fetchTableSchema, queryWithDefaults.location, queryWithDefaults.dataset, queryWithDefaults.table]);

  const processQuery = (q: BigQueryQueryNG) => {
    if (isQueryValid(q)) {
      props.onRunQuery();
    }
  };

  const onFormatChange = (e: SelectableValue) => {
    const next = { ...props.query, format: e.value || QueryFormat.Timeseries };
    props.onChange(next);
    processQuery(next);
  };

  const onLocationChange = (e: SelectableValue) => {
    const next = { ...props.query, location: e.value || DEFAULT_REGION };
    props.onChange(next);
    processQuery(next);
  };

  const onDatasetChange = (e: SelectableValue) => {
    const next = {
      ...queryWithDefaults,
      dataset: e.value,
      table: undefined,
    };

    setIsSchemaOpen(false);
    props.onChange(next);
    processQuery(next);
  };

  const onTableChange = (e: SelectableValue) => {
    const next = {
      ...queryWithDefaults,
      table: e.value,
    };
    props.onChange(next);
    fetchTableSchema(next.location, next.dataset, next.table);
    processQuery(next);
  };

  const schemaTab = (
    <Tab
      label="Table schema"
      active={isSchemaOpen}
      onChangeTab={() => {
        if (!Boolean(queryWithDefaults.table)) {
          return;
        }
        setIsSchemaOpen(true);
      }}
      icon={fetchTableSchemaState.loading ? 'fa fa-spinner' : undefined}
    />
  );

  if (apiLoading || apiError || !apiClient) {
    return null;
  }

  return (
    <>
      <HorizontalGroup>
        <Field label="Processing location">
          <Select
            options={PROCESSING_LOCATIONS}
            value={queryWithDefaults.location}
            onChange={onLocationChange}
            className="width-12"
            menuShouldPortal={true}
          />
        </Field>

        <Field label="Dataset">
          <DatasetSelector
            apiClient={apiClient}
            location={queryWithDefaults.location!}
            value={queryWithDefaults.dataset}
            onChange={onDatasetChange}
            className="width-12"
          />
        </Field>

        <Field label="Table">
          <TableSelector
            apiClient={apiClient}
            location={queryWithDefaults.location!}
            dataset={queryWithDefaults.dataset!}
            value={queryWithDefaults.table}
            disabled={queryWithDefaults.dataset === undefined}
            onChange={onTableChange}
            className="width-12"
            applyDefault
          />
        </Field>

        <Field label="Format as">
          <Select
            options={QUERY_FORMAT_OPTIONS}
            value={queryWithDefaults.format}
            onChange={onFormatChange}
            className="width-12"
            menuShouldPortal={true}
          />
        </Field>
      </HorizontalGroup>

      <TabsBar>
        <Tab label={'Query'} active={!isSchemaOpen} onChangeTab={() => setIsSchemaOpen(false)} />
        {queryWithDefaults.table ? schemaTab : <Tooltip content={'Choose table first'}>{schemaTab}</Tooltip>}
      </TabsBar>

      <TabContent>
        {!isSchemaOpen && (
          <QueryEditorRaw
            schema={fetchTableSchemaState.value ? fetchTableSchemaState.value.schema : []}
            columns={fetchTableSchemaState.value ? fetchTableSchemaState.value.columns : []}
            query={queryWithDefaults}
            onChange={props.onChange}
            onRunQuery={props.onRunQuery}
          />
        )}
        {isSchemaOpen && (
          <div
            style={{
              height: '300px',
              padding: `${theme.spacing(1)}`,
              marginBottom: `${theme.spacing(1)}`,
              border: `1px solid ${theme.colors.border.medium}`,
              overflow: 'auto',
            }}
          >
            {fetchTableSchemaState.value && fetchTableSchemaState.value.schema && props.query.table && (
              <CustomScrollbar>
                <JSONFormatter json={fetchTableSchemaState.value.schema} open={2} />
              </CustomScrollbar>
            )}
          </div>
        )}
      </TabContent>
    </>
  );
}
