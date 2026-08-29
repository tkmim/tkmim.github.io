(function () {
  'use strict';

  // Shared constants for calendar labels and default value-to-color mapping.
  const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const DEFAULT_COLOR_SCALE = [
    { min: -Infinity, max: -3, cssVar: '--color-calendar-graph-day-Lm4-bg' },
    { min: -3, max: -2, cssVar: '--color-calendar-graph-day-Lm3-bg' },
    { min: -2, max: -1, cssVar: '--color-calendar-graph-day-Lm2-bg' },
    { min: -1, max: 0, cssVar: '--color-calendar-graph-day-Lm1-bg' },
    { min: 0, max: 1, cssVar: '--color-calendar-graph-day-m-bg' },
    { min: 1, max: 2, cssVar: '--color-calendar-graph-day-Lp1-bg' },
    { min: 2, max: 3, cssVar: '--color-calendar-graph-day-Lp2-bg' },
    { min: 3, max: 4, cssVar: '--color-calendar-graph-day-Lp3-bg' },
    { min: 4, max: Infinity, cssVar: '--color-calendar-graph-day-Lp4-bg' },
  ];

  const DEFAULTS = {
    container: null,
    graphTarget: '#graph-svg',
    yearListTarget: '#year-list',
    tooltipTarget: '#svg-tip',
    feedbackTarget: '#calendar-feedback',
    titleTarget: '[data-calendar-title]',
    presetListTarget: '[data-calendar-preset-list]',
    dataSource: './assets/data_reading',
    variable: 'T_mean',
    defaultYear: 2020,
    yearRange: null,
    range: null,
    clipCurrentYear: true,
    currentYearLagDays: 5,
    missingValueThreshold: -9998,
    mobileTooltipWidth: 768,
    colorScale: DEFAULT_COLOR_SCALE,
    labels: {
      loading: 'Loading calendar data...',
      empty: 'No data in selected period.',
      error: 'Failed to load calendar data.',
    },
    presets: null,
    activePreset: null,
    title: '',
    onYearChange: null,
    onRender: null,
    onError: null,
  };

  const DATA_CACHE = new Map();

  function isElement(value) {
    return value instanceof Element || value instanceof HTMLDocument;
  }

  function pad2(value) {
    return String(value).padStart(2, '0');
  }

  function formatDateKey(date) {
    return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
  }

  function toDate(value, name) {
    const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
    if (Number.isNaN(date.getTime())) {
      throw new Error(`Invalid date for ${name}: ${value}`);
    }
    return date;
  }

  function startOfDay(date) {
    const copy = new Date(date.getTime());
    copy.setHours(0, 0, 0, 0);
    return copy;
  }

  function endOfDay(date) {
    const copy = new Date(date.getTime());
    copy.setHours(23, 59, 59, 999);
    return copy;
  }

  function addDays(date, days) {
    const copy = new Date(date.getTime());
    copy.setDate(copy.getDate() + days);
    return copy;
  }

  function normalizeColorScale(scale) {
    if (!Array.isArray(scale) || scale.length === 0) {
      return DEFAULT_COLOR_SCALE;
    }
    return scale
      .filter((item) => typeof item === 'object' && typeof item.cssVar === 'string')
      .map((item) => ({
        min: Number.isFinite(item.min) ? item.min : -Infinity,
        max: Number.isFinite(item.max) ? item.max : Infinity,
        cssVar: item.cssVar,
      }));
  }

  function createYearRange(minYear, maxYear) {
    const years = [];
    for (let year = maxYear; year >= minYear; year -= 1) {
      years.push(year);
    }
    return years;
  }

  function resolveElement(target, fallbackSelector, container, required) {
    if (isElement(target)) {
      return target;
    }
    const selector = typeof target === 'string' ? target : fallbackSelector;
    const fromContainer = container ? container.querySelector(selector) : null;
    const element = fromContainer || document.querySelector(selector);
    if (!element && required) {
      throw new Error(`Missing required element: ${selector}`);
    }
    return element;
  }

  function readDataset(container) {
    if (!container || !container.dataset) {
      return {};
    }

    const dataset = container.dataset;
    const options = {};

    if (dataset.source) options.dataSource = dataset.source;
    if (dataset.variable) options.variable = dataset.variable;
    if (dataset.preset) options.activePreset = dataset.preset;
    if (dataset.title) options.title = dataset.title;
    if (dataset.defaultYear) options.defaultYear = Number(dataset.defaultYear);
    if (dataset.minYear && dataset.maxYear) {
      options.yearRange = [Number(dataset.minYear), Number(dataset.maxYear)];
    }
    if (dataset.start && dataset.end) {
      options.range = { start: dataset.start, end: dataset.end };
    }
    if (dataset.currentYearLagDays) {
      options.currentYearLagDays = Number(dataset.currentYearLagDays);
    }
    if (dataset.clipCurrentYear) {
      options.clipCurrentYear = dataset.clipCurrentYear !== 'false';
    }
    if (dataset.graphTarget) options.graphTarget = dataset.graphTarget;
    if (dataset.yearListTarget) options.yearListTarget = dataset.yearListTarget;
    if (dataset.tooltipTarget) options.tooltipTarget = dataset.tooltipTarget;
    if (dataset.feedbackTarget) options.feedbackTarget = dataset.feedbackTarget;
    if (dataset.titleTarget) options.titleTarget = dataset.titleTarget;
    if (dataset.presetListTarget) options.presetListTarget = dataset.presetListTarget;

    return options;
  }

  function normalizePresets(presets) {
    if (!presets) {
      return {};
    }

    if (Array.isArray(presets)) {
      return presets.reduce((acc, preset, index) => {
        if (preset && typeof preset === 'object') {
          const key = String(preset.key || preset.id || preset.name || index);
          acc[key] = preset;
        }
        return acc;
      }, {});
    }

    if (typeof presets === 'object') {
      return { ...presets };
    }

    return {};
  }

  function applyPresetOptions(options, preset, presetKey) {
    if (!preset || typeof preset !== 'object') {
      return options;
    }

    const next = { ...options };
    if (typeof preset.title === 'string') next.title = preset.title;
    if (typeof preset.dataSource === 'string') next.dataSource = preset.dataSource;
    if (typeof preset.variable === 'string') next.variable = preset.variable;
    if (Number.isInteger(preset.defaultYear)) next.defaultYear = preset.defaultYear;
    if (Array.isArray(preset.yearRange)) next.yearRange = preset.yearRange;
    if (preset.range) next.range = preset.range;
    if (preset.clipCurrentYear !== undefined) next.clipCurrentYear = Boolean(preset.clipCurrentYear);
    if (preset.currentYearLagDays !== undefined) next.currentYearLagDays = Number(preset.currentYearLagDays);
    if (preset.missingValueThreshold !== undefined) next.missingValueThreshold = Number(preset.missingValueThreshold);
    if (preset.colorScale) next.colorScale = normalizeColorScale(preset.colorScale);
    if (preset.labels) {
      next.labels = {
        ...next.labels,
        ...preset.labels,
      };
    }

    next.activePreset = presetKey;
    return next;
  }

  function normalizeOptions(options) {
    // Input processing layer: merge defaults, resolve DOM targets, and validate user input.
    let merged = {
      ...DEFAULTS,
      ...options,
      labels: {
        ...DEFAULTS.labels,
        ...(options && options.labels ? options.labels : {}),
      },
    };

    const container = merged.container
      ? (isElement(merged.container) ? merged.container : document.querySelector(merged.container))
      : null;

    merged.container = container;
    merged.graphElement = resolveElement(merged.graphTarget, '#graph-svg', container, true);
    merged.yearListElement = resolveElement(merged.yearListTarget, '#year-list', container, false);
    merged.tooltipElement = resolveElement(merged.tooltipTarget, '#svg-tip', container, false);
    merged.feedbackElement = resolveElement(merged.feedbackTarget, '#calendar-feedback', container, false);
    merged.titleElement = resolveElement(merged.titleTarget, '[data-calendar-title]', container, false);
    merged.presetListElement = resolveElement(merged.presetListTarget, '[data-calendar-preset-list]', container, false);
    merged.colorScale = normalizeColorScale(merged.colorScale);
    merged.presets = normalizePresets(merged.presets);

    if (!merged.activePreset && Object.keys(merged.presets).length > 0) {
      merged.activePreset = Object.keys(merged.presets)[0];
    }

    if (merged.activePreset && merged.presets[merged.activePreset]) {
      merged = applyPresetOptions(merged, merged.presets[merged.activePreset], merged.activePreset);
      merged.colorScale = normalizeColorScale(merged.colorScale);
    }

    if (!merged.dataSource || typeof merged.dataSource !== 'string') {
      throw new Error('dataSource must be a non-empty string');
    }
    if (!merged.variable || typeof merged.variable !== 'string') {
      throw new Error('variable must be a non-empty string');
    }

    if (merged.yearRange) {
      const minYear = Number(merged.yearRange[0]);
      const maxYear = Number(merged.yearRange[1]);
      if (!Number.isInteger(minYear) || !Number.isInteger(maxYear) || minYear > maxYear) {
        throw new Error('yearRange must be [minYear, maxYear] with minYear <= maxYear');
      }
      merged.yearRange = [minYear, maxYear];
    }

    return merged;
  }

  function mapValueToColor(value, options) {
    if (value === null || value === undefined) {
      return 'var(--color-calendar-graph-day-nan-bg)';
    }

    for (const item of options.colorScale) {
      if (value >= item.min && value < item.max) {
        return `var(${item.cssVar})`;
      }
    }

    return 'var(--color-calendar-graph-day-m-bg)';
  }

  function buildDateMap(payload, variable, missingThreshold) {
    // Data shaping layer: convert year/day arrays to a YYYY-MM-DD keyed map.
    if (!payload || !payload.coords || !payload.data_vars) {
      throw new Error('Unexpected data schema: missing coords/data_vars');
    }

    const years = payload.coords.year && payload.coords.year.data;
    const variableNode = payload.data_vars[variable];
    if (!Array.isArray(years) || !variableNode || !Array.isArray(variableNode.data)) {
      throw new Error(`Unexpected data schema for variable: ${variable}`);
    }

    const map = new Map();
    for (let yearIndex = 0; yearIndex < years.length; yearIndex += 1) {
      const year = Number(years[yearIndex]);
      const values = variableNode.data[yearIndex];
      if (!Number.isInteger(year) || !Array.isArray(values)) {
        continue;
      }

      for (let dayIndex = 0; dayIndex < values.length; dayIndex += 1) {
        const rawValue = Number(values[dayIndex]);
        const date = new Date(year, 0, dayIndex + 1);
        const key = formatDateKey(date);
        if (!Number.isFinite(rawValue) || rawValue <= missingThreshold) {
          map.set(key, null);
        } else {
          map.set(key, rawValue);
        }
      }
    }

    return {
      years: years.map((year) => Number(year)).filter((year) => Number.isInteger(year)).sort((a, b) => b - a),
      map,
    };
  }

  async function fetchDataSource(url) {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch ${url}: HTTP ${response.status}`);
    }
    return response.json();
  }

  function normalizeRange(inputRange) {
    const start = startOfDay(toDate(inputRange.start, 'range.start'));
    const end = endOfDay(toDate(inputRange.end, 'range.end'));
    if (start.getTime() > end.getTime()) {
      throw new Error('range.start must be <= range.end');
    }
    return { start, end };
  }

  function resolveYearRange(year, options) {
    const numericYear = Number(year);
    if (!Number.isInteger(numericYear)) {
      throw new Error(`Invalid year: ${year}`);
    }

    let start = startOfDay(new Date(numericYear, 0, 1));
    let end = endOfDay(new Date(numericYear, 11, 31));

    const now = new Date();
    const isCurrentYear = numericYear === now.getFullYear();
    if (isCurrentYear && options.clipCurrentYear) {
      end = endOfDay(addDays(startOfDay(now), -Math.max(0, options.currentYearLagDays)));
      if (end.getTime() < start.getTime()) {
        end = endOfDay(start);
      }
    }

    return { year: numericYear, start, end };
  }

  class CalendarTableInstance {
    constructor(options) {
      this.options = normalizeOptions(options || {});
      this.state = {
        years: [],
        selectedYear: null,
        range: null,
        dateMap: new Map(),
      };

      this._renderToken = 0;
      this._onYearClick = this._onYearClick.bind(this);
      this._onPresetClick = this._onPresetClick.bind(this);
      this._onGraphPointer = this._onGraphPointer.bind(this);
      this._onGraphLeave = this._onGraphLeave.bind(this);
    }

    async init() {
      this._setFeedback('loading');
      await this._loadData({ forceReload: false });
      this._initializeRange();
      this._renderPresetList();
      this._syncTitle();
      this._renderYearList();
      this._attachEvents();
      this._render();
      return this;
    }

    async setYear(year) {
      const resolved = resolveYearRange(year, this.options);
      this.state.selectedYear = resolved.year;
      this.state.range = { start: resolved.start, end: resolved.end };
      this._syncTitle();
      this._render();

      if (typeof this.options.onYearChange === 'function') {
        this.options.onYearChange(resolved.year);
      }

      return this;
    }

    async setRange(range) {
      const normalized = normalizeRange(range);
      this.state.selectedYear = null;
      this.state.range = normalized;
      this._render();
      return this;
    }

    async setDataSource(config) {
      const next = typeof config === 'string' ? { dataSource: config } : (config || {});
      if (next.dataSource) this.options.dataSource = next.dataSource;
      if (next.variable) this.options.variable = next.variable;
      if (Number.isFinite(next.missingValueThreshold)) {
        this.options.missingValueThreshold = next.missingValueThreshold;
      }

      this._setFeedback('loading');
      await this._loadData({ forceReload: false });

      this._initializeRange();
      this._syncTitle();
      this._renderYearList();
      this._render();
      return this;
    }

    async setPreset(presetKey) {
      const preset = this.options.presets && this.options.presets[presetKey];
      if (!preset) {
        throw new Error(`Unknown preset: ${presetKey}`);
      }

      const preservedYear = this.state.selectedYear;
      this.options = applyPresetOptions(this.options, preset, presetKey);
      this.options.colorScale = normalizeColorScale(this.options.colorScale);
      this._syncTitle();
      this._syncPresetSelection();
      this._setFeedback('loading');
      await this._loadData({ forceReload: false });

      this._initializeRange(preservedYear);
      this._renderYearList();
      this._syncTitle();
      this._render();
      return this;
    }

    destroy() {
      if (this.options.yearListElement) {
        this.options.yearListElement.removeEventListener('click', this._onYearClick);
      }
      if (this.options.presetListElement) {
        this.options.presetListElement.removeEventListener('click', this._onPresetClick);
      }
      this.options.graphElement.removeEventListener('mouseover', this._onGraphPointer);
      this.options.graphElement.removeEventListener('focusin', this._onGraphPointer);
      this.options.graphElement.removeEventListener('mouseout', this._onGraphLeave);
      this.options.graphElement.removeEventListener('focusout', this._onGraphLeave);
      this._hideTooltip();
    }

    async _loadData({ forceReload }) {
      const cacheKey = `${this.options.dataSource}::${this.options.variable}::${this.options.missingValueThreshold}`;
      let cached = !forceReload ? DATA_CACHE.get(cacheKey) : null;

      if (!cached) {
        const payload = await fetchDataSource(this.options.dataSource);
        cached = buildDateMap(payload, this.options.variable, this.options.missingValueThreshold);
        DATA_CACHE.set(cacheKey, cached);
      }

      this.state.years = cached.years;
      this.state.dateMap = cached.map;
    }

    _initializeRange(preferredYear) {
      if (this.options.range && this.options.range.start && this.options.range.end) {
        this.state.selectedYear = null;
        this.state.range = normalizeRange(this.options.range);
        return;
      }

      const fallbackYear = this.state.years[0] || new Date().getFullYear();
      const preferred = Number.isInteger(preferredYear) && this.state.years.includes(preferredYear)
        ? preferredYear
        : null;
      const configuredDefault = Number.isInteger(this.options.defaultYear) ? this.options.defaultYear : fallbackYear;
      const selected = preferred || (this.state.years.includes(configuredDefault) ? configuredDefault : fallbackYear);

      const resolved = resolveYearRange(selected, this.options);
      this.state.selectedYear = resolved.year;
      this.state.range = { start: resolved.start, end: resolved.end };
    }

    _computeVisibleYears() {
      if (this.options.yearRange) {
        return createYearRange(this.options.yearRange[0], this.options.yearRange[1]);
      }
      return this.state.years.slice();
    }

    _renderYearList() {
      const root = this.options.yearListElement;
      if (!root) {
        return;
      }

      const years = this._computeVisibleYears().sort((a, b) => a - b);
      root.innerHTML = '';

      if (years.length === 0) {
        return;
      }

      const newestYear = years[years.length - 1];
      const newestRowStart = newestYear % 10 === 0
        ? newestYear - 9
        : Math.floor(newestYear / 10) * 10 + 1;

      let rowEnd = newestYear;
      let isNewestRow = true;
      while (rowEnd >= years[0]) {
        const rowStart = isNewestRow ? newestRowStart : rowEnd - 9;
        const rowYears = years.filter((year) => year >= rowStart && year <= rowEnd);
        if (rowYears.length > 0) {
          const row = document.createElement('div');
          row.className = 'calendar-year-row';

          rowYears.forEach((year) => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'js-year-link calendar-year-button';
            button.dataset.year = String(year);
            button.style.gridColumnStart = String(year % 10 || 10);
            button.textContent = String(year);
            if (year === this.state.selectedYear) {
              button.classList.add('selected');
              button.setAttribute('aria-pressed', 'true');
            } else {
              button.setAttribute('aria-pressed', 'false');
            }
            row.appendChild(button);
          });

          root.appendChild(row);
        }

        rowEnd = rowStart - 1;
        isNewestRow = false;
      }
    }

    _renderPresetList() {
      const root = this.options.presetListElement;
      if (!root || !this.options.presets || Object.keys(this.options.presets).length === 0) {
        return;
      }

      root.innerHTML = '';
      Object.entries(this.options.presets).forEach(([key, preset]) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'btn btn-sm btn-outline-secondary';
        button.dataset.preset = key;
        button.textContent = preset.buttonLabel || preset.label || key;
        button.setAttribute('aria-pressed', String(key === this.options.activePreset));
        if (key === this.options.activePreset) {
          button.classList.add('active');
        }
        root.appendChild(button);
      });
    }

    _attachEvents() {
      if (this.options.yearListElement) {
        this.options.yearListElement.addEventListener('click', this._onYearClick);
      }
      if (this.options.presetListElement) {
        this.options.presetListElement.addEventListener('click', this._onPresetClick);
      }
      this.options.graphElement.addEventListener('mouseover', this._onGraphPointer);
      this.options.graphElement.addEventListener('focusin', this._onGraphPointer);
      this.options.graphElement.addEventListener('mouseout', this._onGraphLeave);
      this.options.graphElement.addEventListener('focusout', this._onGraphLeave);
    }

    _onYearClick(event) {
      const button = event.target.closest('.js-year-link');
      if (!button) {
        return;
      }

      event.preventDefault();
      const year = Number(button.dataset.year);
      if (Number.isInteger(year)) {
        this.setYear(year).catch((error) => this._handleError(error));
      }
    }

    _onPresetClick(event) {
      const button = event.target.closest('[data-preset]');
      if (!button || !this.options.presetListElement || !this.options.presetListElement.contains(button)) {
        return;
      }

      event.preventDefault();
      const presetKey = button.dataset.preset;
      if (presetKey) {
        this.setPreset(presetKey).catch((error) => this._handleError(error));
      }
    }

    _render() {
      this._renderToken += 1;
      const renderToken = this._renderToken;

      if (!this.state.range) {
        this._setFeedback('empty');
        return;
      }

      const viewModel = this._buildViewModel(this.state.range.start, this.state.range.end);
      if (renderToken !== this._renderToken) {
        return;
      }

      this.options.graphElement.innerHTML = viewModel.svg;
      this._setFeedback(viewModel.cellCount > 0 ? null : 'empty');
      this._syncYearSelection();

      if (typeof this.options.onRender === 'function') {
        this.options.onRender({
          selectedYear: this.state.selectedYear,
          range: this.state.range,
          cellCount: viewModel.cellCount,
        });
      }
    }

    _buildViewModel(start, end) {
      // Rendering layer: build SVG fragments and UI state from normalized date/value data.
      const firstCellDate = addDays(startOfDay(start), -start.getDay());
      const lastCellDate = addDays(startOfDay(end), 6 - end.getDay());
      const totalDays = Math.round((lastCellDate.getTime() - firstCellDate.getTime()) / 86400000) + 1;
      const totalWeeks = Math.ceil(totalDays / 7);

      const parts = [];
      let cellCount = 0;
      let lastMonth = null;

      // Each week is contained in a <g> group, 
      // and each day is a <rect> within that group.
      for (let week = 0; week < totalWeeks; week += 1) {


        // Each week is a <g> group, and each day is a <rect> within that group.
        // The factor of 15 is the spacing between cell starts (11px cell + 4px gap). 
        // The factor of 7 is the number of days in a week.
        parts.push(`<g transform="translate(${week * 15 + 25}, 0)">`);

        for (let day = 0; day < 7; day += 1) {
          const date = addDays(firstCellDate, week * 7 + day);
          if (date.getTime() < start.getTime() || date.getTime() > end.getTime()) {
            continue;
          }

          if (day === 0 && lastMonth !== date.getMonth()) {
            parts.push(`<text x="0" y="-9" class="month">${MONTHS_SHORT[date.getMonth()]}</text>`);
            lastMonth = date.getMonth();
          }

          const key = formatDateKey(date);
          const value = this.state.dateMap.get(key);
          const color = mapValueToColor(value, this.options);
          const valueText = value === null || value === undefined ? 'No data' : value.toFixed(2);

          // Each day cell is a <rect>. 
          // The factor of 15 is the spacing between cell starts (11px cell + 4px gap).
          parts.push(
            `<rect class="day day-cell" width="11" height="11" x="0" y="${day * 15}" fill="${color}" data-date="${key}" data-value="${valueText}" tabindex="0" aria-label="${key}: ${valueText}"></rect>`
          );
          cellCount += 1;
        }

        parts.push('</g>');
      }

      parts.push('<text text-anchor="start" class="wday" dx="-10" dy="25">Mon</text>');
      parts.push('<text text-anchor="start" class="wday" dx="-10" dy="56">Wed</text>');
      parts.push('<text text-anchor="start" class="wday" dx="-10" dy="85">Fri</text>');

      return {
        svg: parts.join(''),
        cellCount,
      };
    }

    _syncYearSelection() {
      const root = this.options.yearListElement;
      if (!root) {
        return;
      }

      root.querySelectorAll('.js-year-link').forEach((node) => {
        const year = Number(node.dataset.year);
        const selected = year === this.state.selectedYear;
        node.classList.toggle('selected', selected);
        node.setAttribute('aria-pressed', String(selected));
      });
    }

    _syncPresetSelection() {
      const root = this.options.presetListElement;
      if (!root) {
        return;
      }

      root.querySelectorAll('[data-preset]').forEach((node) => {
        const active = node.dataset.preset === this.options.activePreset;
        node.classList.toggle('active', active);
        node.setAttribute('aria-pressed', String(active));
      });
    }

    _syncTitle() {
      if (!this.options.titleElement) {
        return;
      }

      const preset = this.options.activePreset && this.options.presets
        ? this.options.presets[this.options.activePreset]
        : null;
      const title = this.options.title || (preset && preset.title) || '';
      const yearText = Number.isInteger(this.state.selectedYear) ? ` (${this.state.selectedYear})` : '';
      this.options.titleElement.textContent = `${title}${yearText}`;
    }

    _onGraphPointer(event) {
      if (!this.options.tooltipElement || window.innerWidth < this.options.mobileTooltipWidth) {
        return;
      }

      const cell = event.target.closest('.day-cell');
      if (!cell) {
        return;
      }

      const valueText = cell.dataset.value || 'No data';
      const date = toDate(cell.dataset.date, 'tooltip date');
      const dateText = `${date.getDate()}. ${MONTHS_SHORT[date.getMonth()]} ${date.getFullYear()}`;
      this.options.tooltipElement.innerHTML = `<strong>${valueText}</strong> on ${dateText}`;
      this.options.tooltipElement.style.display = 'inline';

      const box = cell.getBoundingClientRect();
      const tipRect = this.options.tooltipElement.getBoundingClientRect();
      const top = box.top + window.scrollY - 50;
      const minLeft = window.scrollX + 4;
      const maxLeft = window.scrollX + window.innerWidth - tipRect.width - 4;
      const rawLeft = box.left + window.scrollX - tipRect.width / 2 + box.width / 2;
      const left = Math.min(Math.max(rawLeft, minLeft), Math.max(minLeft, maxLeft));

      this.options.tooltipElement.style.top = `${top}px`;
      this.options.tooltipElement.style.left = `${left}px`;
    }

    _onGraphLeave(event) {
      const cell = event.target.closest('.day-cell');
      if (!cell) {
        return;
      }
      this._hideTooltip();
    }

    _hideTooltip() {
      if (this.options.tooltipElement) {
        this.options.tooltipElement.style.display = 'none';
      }
    }

    _setFeedback(kind) {
      if (!this.options.feedbackElement) {
        return;
      }

      if (!kind) {
        this.options.feedbackElement.textContent = '';
        this.options.feedbackElement.style.display = 'none';
        return;
      }

      const message = this.options.labels[kind] || '';
      this.options.feedbackElement.textContent = message;
      this.options.feedbackElement.style.display = message ? 'block' : 'none';
    }

    _handleError(error) {
      this._setFeedback('error');
      if (typeof this.options.onError === 'function') {
        this.options.onError(error);
      } else {
        console.error('[CalendarTable]', error);
      }
    }
  }

  async function create(userOptions) {
    const instance = new CalendarTableInstance(userOptions || {});
    try {
      return await instance.init();
    } catch (error) {
      instance._handleError(error);
      throw error;
    }
  }

  async function autoInit(baseOptions) {
    const options = baseOptions || {};
    const selector = options.containerSelector || '.calendar-graph[data-calendar-table]';
    const containers = Array.from(document.querySelectorAll(selector));
    const instances = [];

    for (const container of containers) {
      const merged = {
        ...options,
        ...readDataset(container),
        container,
      };
      delete merged.containerSelector;

      // One-line bootstrapping keeps the HTML integration very small.
      const instance = await create(merged);
      instances.push(instance);
    }

    return instances;
  }

  window.CalendarTable = {
    create,
    autoInit,
    version: '1.0.0',
  };
})();
