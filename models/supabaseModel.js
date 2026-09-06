const { createSupabaseAdminClient } = require('../config/supabase');

const INTERNAL_KEYS = new Set(['_id', '__table', '__relations', '__defaults', '__computed']);

function clone(value) {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
}

function comparable(value) {
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'string') {
    const timestamp = Date.parse(value);
    if (!Number.isNaN(timestamp) && /^\d{4}-\d{2}-\d{2}/.test(value)) return timestamp;
  }
  return value;
}

function sameValue(left, right) {
  if (left && typeof left === 'object') left = left.id || left._id || left;
  if (right && typeof right === 'object') right = right.id || right._id || right;
  return String(left) === String(right);
}

function matchesCondition(value, condition) {
  if (condition instanceof RegExp) return condition.test(String(value ?? ''));
  if (!condition || typeof condition !== 'object' || condition instanceof Date || Array.isArray(condition)) {
    if (Array.isArray(value)) return value.some((entry) => sameValue(entry, condition));
    return sameValue(value, condition);
  }

  return Object.entries(condition).every(([operator, expected]) => {
    if (operator === '$options') return true;
    if (operator === '$ne') return !sameValue(value, expected);
    if (operator === '$in') return expected.some((entry) => sameValue(value, entry));
    if (operator === '$nin') return !expected.some((entry) => sameValue(value, entry));
    if (operator === '$exists') return expected ? value !== undefined && value !== null : value === undefined || value === null;
    if (operator === '$gte') return comparable(value) >= comparable(expected);
    if (operator === '$lte') return comparable(value) <= comparable(expected);
    if (operator === '$gt') return comparable(value) > comparable(expected);
    if (operator === '$lt') return comparable(value) < comparable(expected);
    if (operator === '$regex') {
      const regex = expected instanceof RegExp ? expected : new RegExp(expected, condition.$options || '');
      return regex.test(String(value ?? ''));
    }
    return true;
  });
}

function matches(row, filter = {}) {
  return Object.entries(filter).every(([field, condition]) => {
    if (field === '$or') return condition.some((entry) => matches(row, entry));
    if (field === '$and') return condition.every((entry) => matches(row, entry));
    if (field === '$expr') return Boolean(evaluateExpression(condition, row));
    const normalizedField = field === '_id' ? 'id' : field;
    const value = normalizedField.split('.').reduce((current, part) => current?.[part], row);
    return matchesCondition(value, condition);
  });
}

function normalizeUpdate(update = {}) {
  const output = { ...(update.$set || {}) };
  for (const [key, value] of Object.entries(update)) if (!key.startsWith('$')) output[key] = value;
  if (update.$inc) output.__increments = update.$inc;
  return output;
}

function applyProjection(row, projection) {
  if (!projection) return row;
  const fields = typeof projection === 'string' ? projection.split(/\s+/).filter(Boolean) : Object.keys(projection);
  const included = fields.filter((field) => !field.startsWith('-') && projection[field] !== 0 && !field.startsWith('+'));
  const excluded = fields.filter((field) => field.startsWith('-') || projection[field] === 0).map((field) => field.replace(/^-/, ''));

  if (included.length) {
    const selected = {};
    for (const field of included) {
      if (field === '_id') selected._id = row._id;
      else if (row[field] !== undefined) selected[field] = row[field];
    }
    if (!fields.includes('-_id') && projection._id !== 0) selected._id = row._id;
    if (row.id !== undefined) selected.id = row.id;
    return selected;
  }

  const selected = { ...row };
  for (const field of excluded) delete selected[field];
  return selected;
}

function toDatabasePayload(document, table, relations) {
  const payload = {};
  for (const [key, rawValue] of Object.entries(document)) {
    if (INTERNAL_KEYS.has(key) || key === 'password' || typeof rawValue === 'function') continue;
    let value = rawValue;
    if (relations[key] && value && typeof value === 'object') value = value.id || value._id;
    if (value instanceof Date) value = value.toISOString();
    payload[key] = value;
  }
  delete payload._id;
  if (!payload.id) delete payload.id;
  payload.updatedAt = new Date().toISOString();
  return payload;
}

function mapError(error) {
  if (!error) return null;
  const mapped = new Error(error.message);
  mapped.details = error.details;
  mapped.hint = error.hint;
  mapped.code = error.code === '23505' ? 11000 : error.code;
  return mapped;
}

async function fetchAllRows(client, table) {
  const pageSize = 1000;
  const rows = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await client.from(table).select('*').range(from, from + pageSize - 1);
    if (error) throw mapError(error);
    rows.push(...(data || []));
    if (!data || data.length < pageSize) return rows;
  }
}

class SupabaseQuery {
  constructor(model, mode, filter = {}, projection = null) {
    this.model = model;
    this.mode = mode;
    this.filter = filter || {};
    this.projection = projection;
    this.sortSpec = null;
    this.limitCount = null;
    this.skipCount = 0;
    this.populateSpecs = [];
    this.plain = false;
  }

  select(projection) { this.projection = projection; return this; }
  sort(spec) { this.sortSpec = spec; return this; }
  limit(count) { this.limitCount = Number(count); return this; }
  skip(count) { this.skipCount = Number(count); return this; }
  lean() { this.plain = true; return this; }
  populate(field, projection) { this.populateSpecs.push({ field, projection }); return this; }

  async execute() {
    const client = createSupabaseAdminClient();
    let rows = (await fetchAllRows(client, this.model.table)).filter((row) => matches(row, this.filter));
    if (this.sortSpec) {
      const entries = Object.entries(this.sortSpec);
      rows.sort((left, right) => {
        for (const [field, direction] of entries) {
          const a = comparable(left[field]);
          const b = comparable(right[field]);
          if (a < b) return -1 * direction;
          if (a > b) return direction;
        }
        return 0;
      });
    }
    if (this.skipCount) rows = rows.slice(this.skipCount);
    if (this.limitCount !== null) rows = rows.slice(0, this.limitCount);
    if (this.mode === 'one') rows = rows.slice(0, 1);

    let documents = rows.map((row) => this.model.hydrate(row));
    for (const spec of this.populateSpecs) documents = await this.model.populate(documents, spec.field, spec.projection);
    documents = documents.map((document) => applyProjection(document, this.projection));

    if (this.mode === 'one') return documents[0] || null;
    if (this.plain) return documents.map((document) => clone(document));
    return documents;
  }

  then(resolve, reject) { return this.execute().then(resolve, reject); }
  catch(reject) { return this.execute().catch(reject); }
}

function evaluateExpression(expression, row) {
  if (typeof expression === 'string' && expression.startsWith('$')) return row[expression.slice(1)];
  if (expression?.$ifNull) {
    const value = evaluateExpression(expression.$ifNull[0], row);
    return value === null || value === undefined ? evaluateExpression(expression.$ifNull[1], row) : value;
  }
  if (expression?.$lt) return comparable(evaluateExpression(expression.$lt[0], row)) < comparable(evaluateExpression(expression.$lt[1], row));
  if (expression?.$lte) return comparable(evaluateExpression(expression.$lte[0], row)) <= comparable(evaluateExpression(expression.$lte[1], row));
  if (expression?.$gt) return comparable(evaluateExpression(expression.$gt[0], row)) > comparable(evaluateExpression(expression.$gt[1], row));
  if (expression?.$gte) return comparable(evaluateExpression(expression.$gte[0], row)) >= comparable(evaluateExpression(expression.$gte[1], row));
  if (expression?.$eq) return sameValue(evaluateExpression(expression.$eq[0], row), evaluateExpression(expression.$eq[1], row));
  if (expression?.$multiply) return expression.$multiply.reduce((total, value) => total * Number(evaluateExpression(value, row) || 0), 1);
  if (expression?.$dateAdd) {
    const date = new Date(evaluateExpression(expression.$dateAdd.startDate, row));
    date.setUTCDate(date.getUTCDate() + Number(expression.$dateAdd.amount || 0));
    return date.toISOString();
  }
  if (expression?.$dateToString) return new Date(evaluateExpression(expression.$dateToString.date, row)).toISOString().slice(0, 10);
  return expression;
}

function aggregateRows(rows, pipeline) {
  let output = rows.map((row) => ({ ...row, _id: row.id }));
  for (const stage of pipeline) {
    if (stage.$match) output = output.filter((row) => matches(row, stage.$match));
    if (stage.$sort) {
      const entries = Object.entries(stage.$sort);
      output.sort((a, b) => {
        for (const [field, direction] of entries) {
          if (comparable(a[field]) < comparable(b[field])) return -direction;
          if (comparable(a[field]) > comparable(b[field])) return direction;
        }
        return 0;
      });
    }
    if (stage.$addFields) {
      output = output.map((row) => {
        const additions = {};
        for (const [field, expression] of Object.entries(stage.$addFields)) additions[field] = evaluateExpression(expression, row);
        return { ...row, ...additions };
      });
    }
    if (stage.$group) {
      const groups = new Map();
      for (const row of output) {
        const key = evaluateExpression(stage.$group._id, row);
        const serializedKey = JSON.stringify(key);
        if (!groups.has(serializedKey)) groups.set(serializedKey, { _id: key });
        const group = groups.get(serializedKey);
        for (const [field, accumulator] of Object.entries(stage.$group)) {
          if (field === '_id') continue;
          if (accumulator.$sum !== undefined) group[field] = Number(group[field] || 0) + Number(evaluateExpression(accumulator.$sum, row) || 0);
          if (accumulator.$first !== undefined && group[field] === undefined) group[field] = evaluateExpression(accumulator.$first, row);
        }
      }
      output = [...groups.values()];
    }
  }
  return output;
}

function createSupabaseModel({ table, defaults = {}, relations = {}, methods = {}, computed = {} }) {
  class Document {
    constructor(data = {}) {
      Object.assign(this, clone(defaults), clone(data));
      if (this._id && !this.id) this.id = String(this._id);
      if (this.id) this._id = this.id;
      for (const [name, getter] of Object.entries(computed)) {
        Object.defineProperty(this, name, { get: () => getter.call(this), enumerable: false, configurable: true });
      }
    }

    async save() {
      const client = createSupabaseAdminClient();
      const now = new Date().toISOString();
      if (!this.createdAt) this.createdAt = now;
      this.updatedAt = now;
      const payload = toDatabasePayload(this, table, relations);
      const result = this.id
        ? await client.from(table).update(payload).eq('id', this.id).select().single()
        : await client.from(table).insert(payload).select().single();
      if (result.error) throw mapError(result.error);
      Object.assign(this, result.data, { _id: result.data.id });
      return this;
    }

    async deleteOne() {
      if (!this.id) return { deletedCount: 0 };
      const client = createSupabaseAdminClient();
      const { error } = await client.from(table).delete().eq('id', this.id);
      if (error) throw mapError(error);
      return { deletedCount: 1 };
    }

    toObject() { return clone(this); }
    toJSON() { return { ...this, _id: this.id }; }
    markModified() {}
    isModified() { return true; }
  }

  Object.assign(Document.prototype, methods);

  function Model(data) { return new Document(data); }
  Model.table = table;
  Model.hydrate = (row) => new Document({ ...row, _id: row.id });
  Model.find = (filter, projection) => new SupabaseQuery(Model, 'many', filter, projection);
  Model.findOne = (filter, projection) => new SupabaseQuery(Model, 'one', filter, projection);
  Model.findById = (id, projection) => new SupabaseQuery(Model, 'one', { id: String(id) }, projection);
  Model.countDocuments = async (filter = {}) => (await Model.find(filter).lean()).length;
  Model.create = async (data) => new Model(data).save();
  Model.insertMany = async (documents) => Promise.all(documents.map((document) => Model.create(document)));
  Model.aggregate = async (pipeline = []) => aggregateRows(await Model.find({}).lean(), pipeline);
  Model.findByIdAndDelete = async (id) => {
    const document = await Model.findById(id);
    if (!document) return null;
    await document.deleteOne();
    return document;
  };
  Model.deleteOne = async (filter) => {
    const document = await Model.findOne(filter);
    return document ? document.deleteOne() : { deletedCount: 0 };
  };
  Model.updateMany = async (filter, update) => {
    const documents = await Model.find(filter);
    const normalized = normalizeUpdate(update);
    for (const document of documents) {
      if (normalized.__increments) for (const [field, increment] of Object.entries(normalized.__increments)) document[field] = Number(document[field] || 0) + Number(increment);
      Object.assign(document, normalized);
      delete document.__increments;
      await document.save();
    }
    return { matchedCount: documents.length, modifiedCount: documents.length };
  };
  Model.findByIdAndUpdate = async (id, update, options = {}) => {
    const document = await Model.findById(id);
    if (!document) return null;
    const normalized = normalizeUpdate(update);
    if (normalized.__increments) {
      for (const [field, increment] of Object.entries(normalized.__increments)) document[field] = Number(document[field] || 0) + Number(increment);
      delete normalized.__increments;
    }
    Object.assign(document, normalized);
    await document.save();
    return options.new === false ? null : document;
  };
  Model.findOneAndUpdate = async (filter, update, options = {}) => {
    const document = await Model.findOne(filter);
    return document ? Model.findByIdAndUpdate(document.id, update, options) : null;
  };
  Model.populate = async (documents, field, projection) => {
    if (!relations[field]) return documents;
    const ids = [...new Set(documents.map((document) => document[field]?.id || document[field]?._id || document[field]).filter(Boolean).map(String))];
    if (!ids.length) return documents;
    const client = createSupabaseAdminClient();
    const { data, error } = await client.from(relations[field]).select('*').in('id', ids);
    if (error) throw mapError(error);
    const byId = new Map((data || []).map((row) => [String(row.id), applyProjection({ ...row, _id: row.id }, projection)]));
    for (const document of documents) {
      const id = document[field]?.id || document[field]?._id || document[field];
      document[field] = id ? byId.get(String(id)) || null : null;
    }
    return documents;
  };

  return Model;
}

module.exports = { createSupabaseModel };
