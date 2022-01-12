// # MIT License

// ## Copyright (c) 2019 DoiT International

// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:

// The above copyright notice and this permission notice shall be included in all
// copies or substantial portions of the Software.

// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
// SOFTWARE.

import _ from 'lodash';

export class SqlPartDef {
  type: string;
  style: string;
  label: string;
  params: any[];
  defaultParams: any[];
  wrapOpen: string;
  wrapClose: string;
  separator: string;

  constructor(options: any) {
    this.type = options.type;
    if (options.label) {
      this.label = options.label;
    } else {
      this.label = this.type[0].toUpperCase() + this.type.substring(1) + ':';
    }

    this.style = options.style;
    if (this.style === 'function') {
      this.wrapOpen = '(';
      this.wrapClose = ')';
      this.separator = ', ';
    } else {
      this.wrapOpen = ' ';
      this.wrapClose = ' ';
      this.separator = ' ';
    }
    this.params = options.params;
    this.defaultParams = options.defaultParams;
  }
}

export class SqlPart {
  part: any;
  def: SqlPartDef;
  params: any[];
  label: string;
  name: string;
  datatype: string;

  constructor(part: any, def: any) {
    this.part = part;
    this.def = def;
    if (!this.def) {
      throw { message: 'Could not find sql part ' + part.type };
    }

    this.datatype = part.datatype;

    if (part.name) {
      this.name = part.name;
      this.label = def.label + ' ' + part.name;
    } else {
      this.name = '';
      this.label = def.label;
    }

    part.params = part.params || _.clone(this.def.defaultParams);
    this.params = part.params;
  }

  updateParam(strValue: string, index: number) {
    // handle optional parameters
    if (strValue === '' && this.def.params[index].optional) {
      this.params.splice(index, 1);
    } else {
      this.params[index] = strValue;
    }

    this.part.params = this.params;
  }
}

const index: Record<string, SqlPartDef> = {};

function createPart(part: { params: string[]; type: string }): any {
  const def = index[part.type];
  if (!def) {
    return null;
  }

  return new SqlPart(part, def);
}

function register(options: any) {
  index[options.type] = new SqlPartDef(options);
}

register({
  defaultParams: ['value'],
  params: [{ type: 'column', dynamicLookup: true }],
  style: 'label',
  type: 'column',
});

register({
  defaultParams: ['value', '=', 'value'],
  label: 'Expr:',
  params: [
    { name: 'left', type: 'string', dynamicLookup: true },
    { name: 'op', type: 'string', dynamicLookup: true },
    { name: 'right', type: 'string', dynamicLookup: true },
  ],
  style: 'expression',
  type: 'expression',
});

register({
  defaultParams: [],
  label: 'Macro:',
  params: [],
  style: 'label',
  type: 'macro',
});

register({
  defaultParams: ['1m'],
  params: [
    {
      name: 'name',
      options: ['1s', '1min', '1h', '1d', '1w', '1m', '1y'],
      type: 'string',
    },
  ],
  style: 'label',
  type: 'timeshift',
});

register({
  type: 'aggregate',
  style: 'label',
  params: [
    {
      name: 'name',
      type: 'string',
      options: ['avg', 'count', 'min', 'max', 'sum', 'stddev', 'variance'],
    },
  ],
  defaultParams: ['avg'],
});

register({
  type: 'alias',
  style: 'label',
  params: [{ name: 'name', type: 'string', quote: 'double' }],
  defaultParams: ['alias'],
});

register({
  type: 'time',
  style: 'function',
  label: 'time',
  params: [
    {
      name: 'interval',
      options: ['$__interval', '1s', '1min', '1h', '1d', '1w', '1m', '1y', 'auto'],
      type: 'interval',
    },
    {
      name: 'mininterval',
      type: 'interval',
      options: ['$__mininterval', '1s', '1min', '1h', '1d', '1w', '1m', '1y'],
    },
  ],
  defaultParams: ['$__interval', '0'],
});

register({
  type: 'window',
  style: 'label',
  params: [
    {
      name: 'function',
      type: 'string',
      options: ['delta', 'increase', 'rate', 'sum'],
    },
  ],
  defaultParams: ['increase'],
});

register({
  type: 'moving_window',
  style: 'label',
  label: 'Moving Window:',
  params: [
    {
      name: 'function',
      type: 'string',
      options: ['avg'],
    },
    {
      name: 'window_size',
      type: 'number',
      options: ['3', '5', '7', '10', '20'],
    },
  ],
  defaultParams: ['avg', '5'],
});

register({
  type: 'hll_count.merge',
  style: 'label',
  label: 'Hll_count.merge:',
  params: [
    {
      name: 'function',
      type: 'string',
      options: ['precision'],
    },
    {
      name: 'precision',
      type: 'number',
      options: ['10', '11', '12', '13', '14', '15', '16', '17', '18', '19', '20', '21', '22', '23', '24'],
    },
  ],
  defaultParams: ['precision', '15'],
});

register({
  type: 'hll_count.extract',
  style: 'label',
  label: 'Hll_count.extract:',
  params: [
    {
      name: 'function',
      type: 'string',
      options: ['precision'],
    },
    {
      name: 'precision',
      type: 'number',
      options: ['10', '11', '12', '13', '14', '15', '16', '17', '18', '19', '20', '21', '22', '23', '24'],
    },
  ],
  defaultParams: ['precision', '15'],
});

export default {
  create: createPart,
};
