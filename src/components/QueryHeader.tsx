import { SelectableValue } from '@grafana/data';
import { EditorField, EditorHeader, EditorMode, EditorRow, FlexItem, InlineSelect, Space } from '@grafana/experimental';
import { Button, InlineField, InlineSwitch, RadioButtonGroup, Select, Tooltip } from '@grafana/ui';
import { BigQueryAPI } from 'api';
import React, { useCallback, useState } from 'react';
import { useCopyToClipboard } from 'react-use';
import { toRawSql } from 'utils/sql.utils';
import { DEFAULT_REGION, PROCESSING_LOCATIONS, QUERY_FORMAT_OPTIONS } from '../constants';
import { BigQueryQueryNG, QueryFormat, QueryRowFilter, QueryWithDefaults } from '../types';
import { ConfirmModal } from './ConfirmModal';
import { DatasetSelector } from './DatasetSelector';
import { ErrorBoundary } from './ErrorBoundary';
import { ProjectSelector } from './ProjectSelector';
import { TableSelector } from './TableSelector';

interface QueryHeaderProps {
  query: QueryWithDefaults;
  onChange: (query: BigQueryQueryNG) => void;
  onRunQuery: () => void;
  onQueryRowChange: (queryRowFilter: QueryRowFilter) => void;
  queryRowFilter: QueryRowFilter;
  apiClient: BigQueryAPI;
  isQueryRunnable: boolean;
  showRunButton?: boolean;
}

const editorModes = [
  { label: 'Builder', value: EditorMode.Builder },
  { label: 'Code', value: EditorMode.Code },
];

export function QueryHeader({
  query,
  queryRowFilter,
  onChange,
  onRunQuery,
  onQueryRowChange,
  apiClient,
  isQueryRunnable,
  showRunButton = true,
}: QueryHeaderProps) {
  const { location, editorMode } = query;
  const [_, copyToClipboard] = useCopyToClipboard();
  const [showConfirm, setShowConfirm] = useState(false);

  const onEditorModeChange = useCallback(
    (newEditorMode: EditorMode) => {
      if (editorMode === EditorMode.Code) {
        setShowConfirm(true);
        return;
      }
      onChange({ ...query, editorMode: newEditorMode });
    },
    [editorMode, onChange, query]
  );

  const onFormatChange = (e: SelectableValue) => {
    const next = { ...query, format: e.value !== undefined ? e.value : QueryFormat.Table };
    onChange(next);
  };

  const onDatasetChange = (e: SelectableValue) => {
    if (e.value === query.dataset) {
      return;
    }

    const next = {
      ...query,
      dataset: e.value,
      table: undefined,
      sql: undefined,
      rawSql: '',
    };

    onChange(next);
  };

  const onProjectChange = (e: SelectableValue) => {
    if (e.value === query.project) {
      return;
    }

    const next = {
      ...query,
      project: e.value,
      dataset: undefined,
      table: undefined,
      sql: undefined,
      rawSql: '',
    };

    onChange(next);
  };

  const onTableChange = (e: SelectableValue) => {
    if (e.value === query.table) {
      return;
    }

    const next: BigQueryQueryNG = {
      ...query,
      table: e.value,
      sql: undefined,
      rawSql: '',
    };
    onChange(next);
  };

  function renderRunButton(): React.ReactNode {
    if (!showRunButton) {
      return null;
    }
    if (isQueryRunnable) {
      return (
        <Button icon="play" variant="primary" size="sm" onClick={() => onRunQuery()}>
          Run query
        </Button>
      );
    }
    return (
      <Tooltip
        theme="error"
        content={
          <>
            Your query is invalid. Check below for details. <br />
            However, you can still run this query.
          </>
        }
        placement="top"
      >
        <Button icon="exclamation-triangle" variant="secondary" size="sm" onClick={() => onRunQuery()}>
          Run query
        </Button>
      </Tooltip>
    );
  }

  return (
    <>
      <EditorHeader>
        {/* Backward compatibility check. Inline select uses SelectContainer that was added in 8.3 */}
        <ErrorBoundary
          fallBackComponent={
            <InlineField label="Processing location" labelWidth={20}>
              <Select
                placeholder="Select location"
                allowCustomValue
                value={location}
                onChange={({ value }) => value && onChange({ ...query, location: value || DEFAULT_REGION })}
                options={PROCESSING_LOCATIONS}
              />
            </InlineField>
          }
        >
          <InlineSelect
            label="Processing location"
            value={location}
            placeholder="Select location"
            allowCustomValue
            menuShouldPortal
            onChange={({ value }) => value && onChange({ ...query, location: value || DEFAULT_REGION })}
            options={PROCESSING_LOCATIONS}
          />
        </ErrorBoundary>

        {/* Backward compatibility check. Inline select uses SelectContainer that was added in 8.3 */}
        <ErrorBoundary
          fallBackComponent={
            <InlineField label="Format" labelWidth={15}>
              <Select
                placeholder="Select format"
                value={query.format}
                onChange={onFormatChange}
                options={QUERY_FORMAT_OPTIONS}
              />
            </InlineField>
          }
        >
          <InlineSelect
            label="Format"
            value={query.format}
            placeholder="Select format"
            menuShouldPortal
            onChange={onFormatChange}
            options={QUERY_FORMAT_OPTIONS}
          />
        </ErrorBoundary>

        {editorMode === EditorMode.Builder && (
          <>
            <InlineSwitch
              id="bq-filter"
              label="Filter"
              transparent={true}
              showLabel={true}
              value={queryRowFilter.filter}
              onChange={(ev) =>
                ev.target instanceof HTMLInputElement &&
                onQueryRowChange({ ...queryRowFilter, filter: ev.target.checked })
              }
            />

            <InlineSwitch
              id="bq-group"
              label="Group"
              transparent={true}
              showLabel={true}
              value={queryRowFilter.group}
              onChange={(ev) =>
                ev.target instanceof HTMLInputElement &&
                onQueryRowChange({ ...queryRowFilter, group: ev.target.checked })
              }
            />

            <InlineSwitch
              id="bq-order"
              label="Order"
              transparent={true}
              showLabel={true}
              value={queryRowFilter.order}
              onChange={(ev) =>
                ev.target instanceof HTMLInputElement &&
                onQueryRowChange({ ...queryRowFilter, order: ev.target.checked })
              }
            />

            <InlineSwitch
              id="bq-preview"
              label="Preview"
              transparent={true}
              showLabel={true}
              value={queryRowFilter.preview}
              onChange={(ev) =>
                ev.target instanceof HTMLInputElement &&
                onQueryRowChange({ ...queryRowFilter, preview: ev.target.checked })
              }
            />
          </>
        )}

        <FlexItem grow={1} />

        {renderRunButton()}

        <RadioButtonGroup options={editorModes} size="sm" value={editorMode} onChange={onEditorModeChange} />

        <ConfirmModal
          isOpen={showConfirm}
          onCopy={() => {
            setShowConfirm(false);
            copyToClipboard(query.rawSql);
            onChange({
              ...query,
              rawSql: toRawSql(query),
              editorMode: EditorMode.Builder,
            });
          }}
          onDiscard={() => {
            setShowConfirm(false);
            onChange({
              ...query,
              rawSql: toRawSql(query),
              editorMode: EditorMode.Builder,
            });
          }}
          onCancel={() => setShowConfirm(false)}
        />
      </EditorHeader>

      {editorMode === EditorMode.Builder && (
        <>
          <Space v={0.5} />

          <EditorRow>
            <ProjectSelector apiClient={apiClient} value={query.project} onChange={onProjectChange} />

            <EditorField label="Dataset" width={25}>
              <DatasetSelector
                apiClient={apiClient}
                location={query.location}
                value={query.dataset === undefined ? null : query.dataset}
                project={query.project}
                onChange={onDatasetChange}
              />
            </EditorField>

            <EditorField label="Table" width={25}>
              <TableSelector
                apiClient={apiClient}
                query={query}
                value={query.table === undefined ? null : query.table}
                onChange={onTableChange}
                applyDefault
              />
            </EditorField>
          </EditorRow>
        </>
      )}
    </>
  );
}
