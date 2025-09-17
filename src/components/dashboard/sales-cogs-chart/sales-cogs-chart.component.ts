import { Component, ChangeDetectionStrategy, ElementRef, inject, viewChild, input, effect, InputSignal } from '@angular/core';
import { CommonModule, CurrencyPipe, DatePipe } from '@angular/common';
import { DailySalesCogs } from '../../../services/cashier-data.service';

declare var d3: any;

@Component({
  selector: 'app-sales-cogs-chart',
  standalone: true,
  imports: [CommonModule],
  template: `<div #chartContainer class="w-full h-full"></div>`,
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [DatePipe, CurrencyPipe]
})
export class SalesCogsChartComponent {
  data: InputSignal<DailySalesCogs[]> = input.required<DailySalesCogs[]>();
  chartContainer = viewChild<ElementRef>('chartContainer');

  private datePipe = inject(DatePipe);
  private currencyPipe = inject(CurrencyPipe);
  
  constructor() {
    effect(() => {
      const data = this.data();
      const container = this.chartContainer();
      if (data && container) {
        this.createChart(data);
      }
    });
  }

  private createChart(data: DailySalesCogs[]) {
    const containerEl = this.chartContainer()!.nativeElement;
    d3.select(containerEl).select('svg').remove();
    d3.select(containerEl).select('div').remove(); // Remove potential error message div

    if (data.length === 0 || data.every(d => d.sales === 0 && d.cogs === 0)) {
        d3.select(containerEl).append('div')
            .attr('class', 'flex items-center justify-center h-full text-gray-500 text-sm')
            .text('Nenhum dado de vendas no período para exibir o gráfico.');
        return;
    }
    
    const margin = { top: 20, right: 30, bottom: 40, left: 60 };
    const width = containerEl.clientWidth - margin.left - margin.right;
    const height = containerEl.clientHeight - margin.top - margin.bottom;

    const svg = d3.select(containerEl)
      .append('svg')
      .attr('width', width + margin.left + margin.right)
      .attr('height', height + margin.top + margin.bottom)
      .append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);
      
    const parseDate = d3.timeParse('%Y-%m-%d');
    const processedData = data.map(d => ({
        date: parseDate(d.date),
        sales: d.sales,
        cogs: d.cogs
    }));

    const x = d3.scaleBand()
      .domain(processedData.map(d => d.date))
      .range([0, width])
      .padding(0.2);

    const y = d3.scaleLinear()
      .domain([0, d3.max(processedData, d => Math.max(d.sales, d.cogs)) * 1.1])
      .range([height, 0]);

    // X-axis
    svg.append('g')
      .attr('transform', `translate(0,${height})`)
      .call(d3.axisBottom(x).tickFormat(d3.timeFormat('%d/%m')).tickValues(x.domain().filter((d, i) => i % (Math.ceil(data.length / 7)) === 0)))
      .selectAll("text")
      .style("fill", "#9ca3af");

    // Y-axis
    svg.append('g')
      .call(d3.axisLeft(y).tickFormat(d => `R$${d / 1000}k`).ticks(5))
       .selectAll("text")
      .style("fill", "#9ca3af");

    const tooltip = d3.select(containerEl).append("div")
        .attr("class", "tooltip p-2 rounded-lg bg-gray-900 border border-gray-600 text-xs shadow-lg text-white")
        .style("position", "absolute")
        .style("opacity", 0)
        .style("pointer-events", "none");

    // Sales bars
    svg.selectAll(".bar-sales")
      .data(processedData)
      .enter().append("rect")
      .attr("class", "bar-sales")
      .attr("x", d => x(d.date))
      .attr("y", d => y(d.sales))
      .attr("width", x.bandwidth() / 2)
      .attr("height", d => height - y(d.sales))
      .attr("fill", "#3b82f6") // blue-600
      .on("mouseover", (event, d) => {
        tooltip.transition().duration(200).style("opacity", .9);
        tooltip.html(`
            <strong>${this.datePipe.transform(d.date, 'dd/MM/yyyy')}</strong><br/>
            Vendas: <strong>${this.currencyPipe.transform(d.sales, 'BRL')}</strong><br/>
            CMV: ${this.currencyPipe.transform(d.cogs, 'BRL')}
        `)
            .style("left", (event.pageX + 10) + "px")
            .style("top", (event.pageY - 28) + "px");
        })
      .on("mouseout", d => {
          tooltip.transition().duration(500).style("opacity", 0);
      });

    // COGS bars
    svg.selectAll(".bar-cogs")
      .data(processedData)
      .enter().append("rect")
      .attr("class", "bar-cogs")
      .attr("x", d => x(d.date) + x.bandwidth() / 2)
      .attr("y", d => y(d.cogs))
      .attr("width", x.bandwidth() / 2)
      .attr("height", d => height - y(d.cogs))
      .attr("fill", "#f59e0b") // amber-500
       .on("mouseover", (event, d) => {
        tooltip.transition().duration(200).style("opacity", .9);
        tooltip.html(`
            <strong>${this.datePipe.transform(d.date, 'dd/MM/yyyy')}</strong><br/>
            Vendas: ${this.currencyPipe.transform(d.sales, 'BRL')}<br/>
            CMV: <strong>${this.currencyPipe.transform(d.cogs, 'BRL')}</strong>
        `)
            .style("left", (event.pageX + 10) + "px")
            .style("top", (event.pageY - 28) + "px");
        })
      .on("mouseout", d => {
          tooltip.transition().duration(500).style("opacity", 0);
      });
  }
}
