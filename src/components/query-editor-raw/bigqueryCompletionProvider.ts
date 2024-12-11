import {
  ColumnDefinition,
  CompletionItemInsertTextRule,
  CompletionItemKind,
  CompletionItemPriority,
  LanguageCompletionProvider,
  LinkedToken,
  StatementPlacementProvider,
  StatementPosition,
  SuggestionKindProvider,
  TableDefinition,
  TableIdentifier,
  TokenType,
} from '@grafana/plugin-ui';
import { PartitioningType, TableSchema } from 'api';
import { BQ_AGGREGATE_FNS } from './bigQueryFunctions';
import { BQ_OPERATORS } from './bigQueryOperators';
import { MACROS } from './macros';

interface CompletionProviderGetterArgs {
  getColumns: React.MutableRefObject<(t: string) => Promise<ColumnDefinition[]>>;
  getTables: React.MutableRefObject<(d?: string) => Promise<TableDefinition[]>>;
  getTableSchema: React.MutableRefObject<(p: string, d: string, t: string) => Promise<TableSchema | null>>;
}

export const getBigQueryCompletionProvider: (args: CompletionProviderGetterArgs) => LanguageCompletionProvider =
  ({ getColumns, getTables, getTableSchema }) =>
  () => ({
    triggerCharacters: ['.', ' ', '$', ',', '(', "'"],
    tables: {
      resolve: async () => {
        return await getTables.current();
      },
      parseName: (token: LinkedToken | null | undefined) => {
        let processedToken = token;
        let tablePath = processedToken?.value ?? '';

        while (processedToken?.next && processedToken?.next?.value !== '`') {
          tablePath += processedToken.next.value;
          processedToken = processedToken.next;
        }

        if (tablePath.trim().startsWith('`')) {
          return { table: tablePath.slice(1) };
        }

        return { table: tablePath };
      },
    },

    columns: {
      resolve: async (t?: TableIdentifier) => {
        return t?.table ? await getColumns.current(t?.table) : [];
      },
    },
    supportedFunctions: () => BQ_AGGREGATE_FNS,
    supportedOperators: () => BQ_OPERATORS,
    customSuggestionKinds: customSuggestionKinds(getTables, getTableSchema),
    customStatementPlacement,
    supportedMacros: () => MACROS,
  });

export enum CustomStatementPlacement {
  AfterDataset = 'afterDataset',
}

export enum CustomSuggestionKind {
  TablesWithinDataset = 'tablesWithinDataset',
  Partition = 'partition',
}

export const customStatementPlacement: StatementPlacementProvider = () => [
  {
    id: CustomStatementPlacement.AfterDataset,
    resolve: (currentToken, previousKeyword) => {
      return Boolean(
        currentToken?.is(TokenType.Delimiter, '.') ||
          (currentToken?.is(TokenType.Whitespace) && currentToken?.previous?.is(TokenType.Delimiter, '.')) ||
          (currentToken?.value === '`' && currentToken?.previous?.is(TokenType.Delimiter, '.')) ||
          (currentToken?.isIdentifier() &&
            currentToken?.value.endsWith('.') &&
            previousKeyword?.getNextNonWhiteSpaceToken()?.value === '`') || //identifiers with a dot at the end like "`projectname."
          (currentToken?.isNumber() && currentToken.value.endsWith('.')) || // number with dot at the end like "projectname-21342."
          (currentToken?.value === '`' && isTypingTableIn(currentToken))
      );
    },
  },
  // Overriding default behavior of AfterFrom resolver
  {
    id: StatementPosition.AfterFrom,
    overrideDefault: true,
    resolve: (currentToken) => {
      const untilFrom = currentToken?.getPreviousUntil(TokenType.Keyword, [], 'from');
      if (!untilFrom) {
        return false;
      }
      let q = '';
      for (let i = untilFrom?.length - 1; i >= 0; i--) {
        q += untilFrom[i].value;
      }

      return q.startsWith('`') && q.endsWith('`');
    },
  },
];

export const customSuggestionKinds: (
  getTables: CompletionProviderGetterArgs['getTables'],
  getTableSchema: CompletionProviderGetterArgs['getTableSchema']
) => SuggestionKindProvider = (getTables, getTableSchema) => () => [
  {
    id: CustomSuggestionKind.TablesWithinDataset,
    applyTo: [CustomStatementPlacement.AfterDataset],
    suggestionsResolver: async (ctx) => {
      const tablePath = ctx.currentToken ? getTablePath(ctx.currentToken) : '';
      const t = await getTables.current(tablePath);

      return t.map((table) => ({
        label: table.name,
        insertText: table.completion ?? table.name,
        command: { id: 'editor.action.triggerSuggest', title: '' },
        kind: CompletionItemKind.Field,
        sortText: CompletionItemPriority.High,
        range: {
          ...ctx.range,
          startColumn: ctx.range.endColumn,
          endColumn: ctx.range.endColumn,
        },
      }));
    },
  },

  {
    id: CustomSuggestionKind.Partition,
    applyTo: [StatementPosition.AfterFrom],
    suggestionsResolver: async (ctx) => {
      const tablePath = ctx.currentToken ? getTablePath(ctx.currentToken) : '';
      const path = tablePath.split('.').filter((s) => s);
      const suggestions = [];

      if (path.length === 3) {
        const schema = await getTableSchema.current(path[0], path[1], path[2]);

        if (schema) {
          const timePartitioningSetup = schema.timePartitioning;
          if (timePartitioningSetup) {
            if (timePartitioningSetup.field) {
              // TODO: add support for field partitioning
            }

            if (timePartitioningSetup.type) {
              // Ingestion-time partition
              // https://cloud.google.com/bigquery/docs/querying-partitioned-tables#query_an_ingestion-time_partitioned_table
              suggestions.push({
                label: '_PARTITIONTIME BETWEEN',
                insertText: 'WHERE _PARTITIONTIME BETWEEN TIMESTAMP("$1") AND TIMESTAMP("$2")',
                kind: CompletionItemKind.Snippet,
                insertTextRules: CompletionItemInsertTextRule.InsertAsSnippet,
                sortText: CompletionItemPriority.MediumLow,
              });
              suggestions.push({
                label: '_PARTITIONTIME EQUALS',
                insertText: 'WHERE DATE(_PARTITIONTIME) = "$1"',
                kind: CompletionItemKind.Snippet,
                insertTextRules: CompletionItemInsertTextRule.InsertAsSnippet,
                sortText: CompletionItemPriority.MediumLow,
              });

              if (timePartitioningSetup.type && timePartitioningSetup.type === PartitioningType.Day) {
                suggestions.push({
                  label: '_PARTITIONDATE BETWEEN',
                  insertText: 'WHERE _PARTITIONDATE BETWEEN DATE("$1") AND DATE("$2")',
                  kind: CompletionItemKind.Snippet,
                  insertTextRules: CompletionItemInsertTextRule.InsertAsSnippet,
                  sortText: CompletionItemPriority.MediumLow,
                });
                suggestions.push({
                  label: '_PARTITIONDATE EQUALS',
                  insertText: 'WHERE DATE(_PARTITIONDATE) = "$1"',
                  kind: CompletionItemKind.Snippet,
                  insertTextRules: CompletionItemInsertTextRule.InsertAsSnippet,
                  sortText: CompletionItemPriority.MediumLow,
                });
              }
            }
          }
        }
      }

      return suggestions;
    },
  },
];

export function getTablePath(token: LinkedToken) {
  let processedToken = token;
  let tablePath = '';
  while (processedToken?.previous && !processedToken.previous.isWhiteSpace()) {
    tablePath = processedToken.value + tablePath;
    processedToken = processedToken.previous;
  }

  tablePath = tablePath.trim();

  if (tablePath.startsWith('`')) {
    tablePath = tablePath.slice(1);
  }

  if (tablePath.endsWith('`')) {
    tablePath = tablePath.slice(0, -1);
  }

  return tablePath;
}

function isTypingTableIn(token: LinkedToken | null, l?: boolean) {
  if (!token) {
    return false;
  }
  const tokens = token.getPreviousUntil(TokenType.Keyword, [], 'from');
  if (!tokens) {
    return false;
  }

  let path = '';
  for (let i = tokens.length - 1; i >= 0; i--) {
    path += tokens[i].value;
  }

  if (path.startsWith('`')) {
    path = path.slice(1);
  }

  return path.split('.').length === 2;
}
