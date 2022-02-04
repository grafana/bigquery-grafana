import { QueryEditorProps } from '@grafana/data';
import { EditorMode, Space } from '@grafana/experimental';
import { RawEditor } from 'components/query-editor-raw/RawEditor';
import React, { useCallback, useEffect, useState } from 'react';
import { useAsync } from 'react-use';
import { applyQueryDefaults, isQueryValid, setDatasourceId } from 'utils';
import { getApiClient } from '../api';
import { QueryHeader } from '../components/QueryHeader';
import { BigQueryDatasource } from '../datasource';
import { BigQueryOptions, BigQueryQueryNG, QueryRowFilter } from '../types';
import { VisualEditor } from './visual-query-builder/VisualEditor';

type Props = QueryEditorProps<BigQueryDatasource, BigQueryQueryNG, BigQueryOptions>;

export function QueryEditor({ datasource, query, onChange, onRunQuery }: Props) {
  setDatasourceId(datasource.id);
  const { loading: apiLoading, error: apiError, value: apiClient } = useAsync(
    async () => await getApiClient(datasource.id),
    [datasource]
  );
  const queryWithDefaults = applyQueryDefaults(query, datasource);
  const [queryRowFilter, setQueryRowFilter] = useState<QueryRowFilter>({
    filter: !!queryWithDefaults.sql.whereString,
    group: !!queryWithDefaults.sql.groupBy?.[0]?.property.name,
    order: !!queryWithDefaults.sql.orderBy?.property.name,
    preview: true,
  });

  useEffect(() => {
    return () => {
      getApiClient(datasource.id).then((client) => client.dispose());
    };
  }, [datasource.id]);

  const processQuery = useCallback(
    (q: BigQueryQueryNG) => {
      if (isQueryValid(q) && onRunQuery) {
        onRunQuery();
      }
    },
    [onRunQuery]
  );

  const onQueryChange = (q: BigQueryQueryNG) => {
    onChange(q);
    processQuery(q);
  };

  if (apiLoading || apiError || !apiClient) {
    return null;
  }

  return (
    <>
      <QueryHeader
        onChange={onChange}
        onRunQuery={onRunQuery}
        onQueryRowChange={setQueryRowFilter}
        queryRowFilter={queryRowFilter}
        query={queryWithDefaults}
        apiClient={apiClient}
      />

      <Space v={0.5} />

      {queryWithDefaults.editorMode !== EditorMode.Code && (
        <VisualEditor
          apiClient={apiClient}
          query={queryWithDefaults}
          onChange={onQueryChange}
          queryRowFilter={queryRowFilter}
        />
      )}

      {queryWithDefaults.editorMode === EditorMode.Code && (
        <RawEditor apiClient={apiClient} query={queryWithDefaults} onChange={onChange} onRunQuery={onRunQuery} />
      )}
    </>
  );
}
