import { toOption } from '@grafana/data';
import { Button, Input, Select } from '@grafana/ui';
import React from 'react';
import { BasicConfig, Config, JsonItem, Settings, Utils, Widgets } from 'react-awesome-query-builder';

const buttonLabels = {
  add: 'Add',
  remove: 'Remove',
};

export const emptyInitValue = {
  id: Utils.uuid(),
  type: 'group' as const,
  children1: {
    [Utils.uuid()]: {
      type: 'rule',
      properties: {
        field: null,
        operator: null,
        value: [],
        valueSrc: [],
      },
    } as JsonItem,
  },
};

export const widgets: Widgets = {
  ...BasicConfig.widgets,
  text: {
    ...BasicConfig.widgets.text,
    factory: function TextInput(props) {
      return (
        <Input
          value={props?.value || ''}
          placeholder={props?.placeholder}
          onChange={(e) => props?.setValue(e.currentTarget.value)}
        />
      );
    },
  },
  number: {
    ...BasicConfig.widgets.number,
    factory: function NumberInput(props) {
      return (
        <Input
          value={props?.value}
          placeholder={props?.placeholder}
          type="number"
          onChange={(e) => props?.setValue(Number.parseInt(e.currentTarget.value, 10))}
        />
      );
    },
  },
};

export const settings: Settings = {
  ...BasicConfig.settings,
  canRegroup: false,
  maxNesting: 1,
  canReorder: false,
  showNot: false,
  addRuleLabel: buttonLabels.add,
  deleteLabel: buttonLabels.remove,
  renderConjs: function Conjunctions(conjProps) {
    return (
      <Select
        id={conjProps?.id}
        aria-label="Conjunction"
        menuShouldPortal
        options={conjProps?.conjunctionOptions ? Object.keys(conjProps?.conjunctionOptions).map(toOption) : undefined}
        value={conjProps?.selectedConjunction}
        onChange={(val) => conjProps?.setConjunction(val.value!)}
      />
    );
  },
  renderField: function Field(fieldProps) {
    return (
      <Select
        id={fieldProps?.id}
        width={25}
        aria-label="Field"
        menuShouldPortal
        options={fieldProps?.items.map((f) => ({ label: f.label, value: f.key }))}
        value={fieldProps?.selectedKey}
        onChange={(val) => {
          fieldProps?.setField(val.label!);
        }}
      />
    );
  },
  renderButton: function RAQBButton(buttonProps) {
    return (
      <Button
        type="button"
        title={`${buttonProps?.label} filter`}
        onClick={buttonProps?.onClick}
        variant="secondary"
        size="md"
        icon={buttonProps?.label === buttonLabels.add ? 'plus' : 'times'}
      />
    );
  },
  renderOperator: function Operator(operatorProps) {
    return (
      <Select
        options={operatorProps?.items.map((op) => ({ label: op.label, value: op.key }))}
        aria-label="Operator"
        menuShouldPortal
        value={operatorProps?.selectedKey}
        onChange={(val) => {
          operatorProps?.setField(val.key);
        }}
      />
    );
  },
};

export const raqbConfig: Config = {
  ...BasicConfig,
  widgets,
  settings,
};

export type { Config };
