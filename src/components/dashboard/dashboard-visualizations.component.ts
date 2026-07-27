import { Component, ChangeDetectionStrategy, ElementRef, inject, viewChild, input, effect, InputSignal } from '@angular/core';
import { CommonModule, CurrencyPipe, DatePipe } from '@angular/common';

declare var d3: any;

export interface DailySalesTrend {
  date: string; // YYYY-MM-DD
  sales: number;
}

export interface TopSellingItem {
  name: string;
  quantity: number;
  revenue: number;
}

@Component({
  selector: 'app-dashboard-visualizations',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="flex flex-col gap-6 w-full">
      <div class="w-full h-[350px] bg-surface-elevated/30 border border-subtle rounded-2xl p-6 shadow-xl backdrop-blur-xl flex flex-col">
        <h3 class="text-xs font-black text-muted mb-4 uppercase tracking-widest flex items-center gap-2">
          <span class="w-2 h-2 rounded-full bg-brand"></span>
          Tendência Diária de Vendas
        </h3>
        <div #salesTrendChart class="flex-1 w-full relative"></div>
      </div>
      <div class="w-full h-[350px] bg-surface-elevated/30 border border-subtle rounded-2xl p-6 shadow-xl backdrop-blur-xl flex flex-col">
        <h3 class="text-xs font-black text-muted mb-4 uppercase tracking-widest flex items-center gap-2">
          <span class="w-2 h-2 rounded-full bg-warning"></span>
          Itens Mais Vendidos (Receita)
        </h3>
        <div #topItemsChart class="flex-1 w-full relative"></div>
      </div>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [DatePipe, CurrencyPipe]
})
export class DashboardVisualizationsComponent {
  salesData: InputSignal<DailySalesTrend[]> = input.required<DailySalesTrend[]>();
  topItemsData: InputSignal<TopSellingItem[]> = input.required<TopSellingItem[]>();

  salesTrendChart = viewChild<ElementRef>('salesTrendChart');
  topItemsChart = viewChild<ElementRef>('topItemsChart');

  private currencyPipe: CurrencyPipe = inject(CurrencyPipe);
  private datePipe: DatePipe = inject(DatePipe);

  constructor() {
    effect(() => {
      const sData = this.salesData();
      const tData = this.topItemsData();
      
      const salesContainer = this.salesTrendChart();
      const topItemsContainer = this.topItemsChart();
      
      if (sData && salesContainer) {
        this.renderSalesChart(sData, salesContainer.nativeElement);
      }
      
      if (tData && topItemsContainer) {
        this.renderTopItemsChart(tData, topItemsContainer.nativeElement);
      }
    });
  }

  private renderSalesChart(data: DailySalesTrend[], containerEl: HTMLElement) {
    d3.select(containerEl).selectAll('*').remove();

    if (!data || data.length === 0) {
      d3.select(containerEl).append('div')
        .attr('class', 'absolute inset-0 flex items-center justify-center text-muted text-sm')
        .text('Nenhum dado de vendas disponível.');
      return;
    }

    const margin = { top: 20, right: 20, bottom: 40, left: 60 };
    const width = containerEl.clientWidth - margin.left - margin.right;
    const height = containerEl.clientHeight - margin.top - margin.bottom;

    if (width <= 0 || height <= 0) return;

    const svg = d3.select(containerEl)
      .append('svg')
      .attr('width', width + margin.left + margin.right)
      .attr('height', height + margin.top + margin.bottom)
      .append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    const parseDate = d3.timeParse('%Y-%m-%d');
    const processedData = data.map(d => ({
      date: parseDate(d.date) || new Date(d.date),
      sales: d.sales
    }));

    const x = d3.scaleTime()
      .domain(d3.extent(processedData, (d: any) => d.date))
      .range([0, width]);

    const y = d3.scaleLinear()
      .domain([0, d3.max(processedData, (d: any) => d.sales) * 1.1])
      .range([height, 0]);

    // X Axis
    svg.append('g')
      .attr('transform', `translate(0,${height})`)
      .call(d3.axisBottom(x).ticks(5).tickFormat(d3.timeFormat('%d/%m')))
      .selectAll('text')
      .style('fill', 'var(--text-muted)')
      .style('font-size', '10px');

    // Y Axis
    svg.append('g')
      .call(d3.axisLeft(y).ticks(5).tickFormat((d: any) => `R$${d / 1000}k`))
      .selectAll('text')
      .style('fill', 'var(--text-muted)')
      .style('font-size', '10px');
      
    // Gridlines
    svg.append('g')
      .attr('class', 'grid')
      .call(d3.axisLeft(y).ticks(5).tickSize(-width).tickFormat(''))
      .selectAll('line')
      .style('stroke', 'var(--border-subtle)')
      .style('stroke-dasharray', '3,3');
      
    svg.selectAll('.domain').remove(); // Remove axis lines for cleaner look

    // Line generator
    const line = d3.line()
      .x((d: any) => x(d.date))
      .y((d: any) => y(d.sales))
      .curve(d3.curveMonotoneX);

    // Area generator for gradient
    const area = d3.area()
      .x((d: any) => x(d.date))
      .y0(height)
      .y1((d: any) => y(d.sales))
      .curve(d3.curveMonotoneX);

    // Gradient
    const defs = svg.append('defs');
    const gradient = defs.append('linearGradient')
      .attr('id', 'sales-gradient')
      .attr('x1', '0%')
      .attr('y1', '0%')
      .attr('x2', '0%')
      .attr('y2', '100%');
      
    gradient.append('stop')
      .attr('offset', '0%')
      .style('stop-color', 'var(--brand-primary)')
      .style('stop-opacity', 0.5);
      
    gradient.append('stop')
      .attr('offset', '100%')
      .style('stop-color', 'var(--brand-primary)')
      .style('stop-opacity', 0);

    // Draw Area
    svg.append('path')
      .datum(processedData)
      .attr('fill', 'url(#sales-gradient)')
      .attr('d', area);

    // Draw Line
    svg.append('path')
      .datum(processedData)
      .attr('fill', 'none')
      .attr('stroke', 'var(--brand-primary)')
      .attr('stroke-width', 3)
      .attr('d', line);

    // Tooltip
    const tooltip = d3.select(containerEl).append('div')
      .attr('class', 'tooltip p-3 rounded-xl bg-surface-elevated border border-strong text-title shadow-2xl absolute z-50 pointer-events-none')
      .style('opacity', 0)
      .style('transform', 'translate(-50%, -100%)')
      .style('margin-top', '-10px');

    // Invisible rects for tooltip interaction
    svg.selectAll('.tooltip-hit-area')
      .data(processedData)
      .enter().append('rect')
      .attr('class', 'tooltip-hit-area')
      .attr('x', (d: any) => x(d.date) - 15)
      .attr('y', 0)
      .attr('width', 30)
      .attr('height', height)
      .attr('fill', 'transparent')
      .on('mouseover', (event: any, d: any) => {
        const cx = x(d.date);
        const cy = y(d.sales);
        
        // Highlight circle
        svg.append('circle')
          .attr('class', 'hover-circle')
          .attr('cx', cx)
          .attr('cy', cy)
          .attr('r', 5)
          .attr('fill', 'var(--surface-base)')
          .attr('stroke', 'var(--brand-primary)')
          .attr('stroke-width', 2);
          
        tooltip.transition().duration(150).style('opacity', 1);
        tooltip.html(`
          <div class="text-[10px] uppercase tracking-widest text-muted mb-1">${this.datePipe.transform(d.date, 'dd/MM/yyyy')}</div>
          <div class="font-black text-lg data-mono">${this.currencyPipe.transform(d.sales, 'BRL')}</div>
        `)
        .style('left', (cx + margin.left) + 'px')
        .style('top', (cy + margin.top) + 'px');
      })
      .on('mouseout', () => {
        svg.selectAll('.hover-circle').remove();
        tooltip.transition().duration(200).style('opacity', 0);
      });
  }

  private renderTopItemsChart(data: TopSellingItem[], containerEl: HTMLElement) {
    d3.select(containerEl).selectAll('*').remove();

    if (!data || data.length === 0) {
      d3.select(containerEl).append('div')
        .attr('class', 'absolute inset-0 flex items-center justify-center text-muted text-sm')
        .text('Nenhum dado de itens disponível.');
      return;
    }

    const margin = { top: 10, right: 80, bottom: 20, left: 120 };
    const width = containerEl.clientWidth - margin.left - margin.right;
    const height = containerEl.clientHeight - margin.top - margin.bottom;

    if (width <= 0 || height <= 0) return;

    const svg = d3.select(containerEl)
      .append('svg')
      .attr('width', width + margin.left + margin.right)
      .attr('height', height + margin.top + margin.bottom)
      .append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    // Sort by revenue descending and take top 10
    const sortedData = [...data].sort((a, b) => a.revenue - b.revenue).slice(-10);

    const x = d3.scaleLinear()
      .domain([0, d3.max(sortedData, (d: any) => d.revenue) * 1.1])
      .range([0, width]);

    const y = d3.scaleBand()
      .domain(sortedData.map(d => d.name))
      .range([height, 0])
      .padding(0.3);

    // Y Axis (Item Names)
    svg.append('g')
      .call(d3.axisLeft(y).tickSize(0))
      .selectAll('text')
      .style('fill', 'var(--text-title)')
      .style('font-weight', '500')
      .style('font-size', '11px')
      .attr('dx', '-10px');
      
    svg.selectAll('.domain').remove(); // Remove axis line

    // Tooltip
    const tooltip = d3.select(containerEl).append('div')
      .attr('class', 'tooltip p-3 rounded-xl bg-surface-elevated border border-strong text-title shadow-2xl absolute z-50 pointer-events-none')
      .style('opacity', 0);

    // Bars
    svg.selectAll('.bar')
      .data(sortedData)
      .enter().append('rect')
      .attr('class', 'bar')
      .attr('y', (d: any) => y(d.name))
      .attr('height', y.bandwidth())
      .attr('x', 0)
      .attr('width', (d: any) => x(d.revenue))
      .attr('fill', 'var(--accent-warning)')
      .attr('rx', 4)
      .on('mouseover', (event: any, d: any) => {
        d3.select(event.currentTarget).attr('opacity', 0.8);
        tooltip.transition().duration(150).style('opacity', 1);
        tooltip.html(`
          <div class="text-[10px] uppercase tracking-widest text-muted mb-1">${d.name}</div>
          <div class="flex flex-col gap-1">
            <div class="font-black text-lg data-mono text-warning">${this.currencyPipe.transform(d.revenue, 'BRL')}</div>
            <div class="text-xs font-medium text-muted">${d.quantity} unidades</div>
          </div>
        `)
        .style('left', (event.pageX + 10) + 'px')
        .style('top', (event.pageY - 20) + 'px');
      })
      .on('mouseout', (event: any) => {
        d3.select(event.currentTarget).attr('opacity', 1);
        tooltip.transition().duration(200).style('opacity', 0);
      });
      
    // Values at the end of bars
    svg.selectAll('.value-label')
      .data(sortedData)
      .enter().append('text')
      .attr('class', 'value-label')
      .attr('x', (d: any) => x(d.revenue) + 8)
      .attr('y', (d: any) => y(d.name) + y.bandwidth() / 2)
      .attr('dy', '0.35em')
      .text((d: any) => this.currencyPipe.transform(d.revenue, 'BRL'))
      .style('fill', 'var(--text-muted)')
      .style('font-size', '10px')
      .style('font-weight', '700')
      .style('font-family', 'monospace');
  }
}
