import { Component, ChangeDetectionStrategy, ElementRef, inject, viewChild, input, effect, InputSignal } from '@angular/core';
import { CommonModule, CurrencyPipe } from '@angular/common';
import { PeakHoursData } from '../../../services/cashier-data.service';

declare var d3: any;

@Component({
  selector: 'app-hourly-sales-chart',
  standalone: true,
  imports: [CommonModule],
  template: `<div #chartContainer class="w-full h-full"></div>`,
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [CurrencyPipe]
})
export class HourlySalesChartComponent {
  data: InputSignal<PeakHoursData[]> = input.required<PeakHoursData[]>();
  chartContainer = viewChild<ElementRef>('chartContainer');
  // FIX: Add explicit type to injected pipe to resolve type inference issues in d3 callbacks.
  private currencyPipe: CurrencyPipe = inject(CurrencyPipe);
  
  constructor() {
    effect(() => {
      const data = this.data();
      const container = this.chartContainer();
      if (data && container) {
        this.createChart(data);
      }
    });
  }

  private createChart(data: PeakHoursData[]) {
    const containerEl = this.chartContainer()!.nativeElement;
    d3.select(containerEl).select('svg').remove();
    d3.select(containerEl).select('div').remove();

    const hasSales = data.some(d => d.sales > 0);

    if (!hasSales) {
        d3.select(containerEl).append('div')
            .attr('class', 'flex items-center justify-center h-full text-gray-500 text-sm')
            .text('Nenhuma venda hoje para exibir o gráfico.');
        return;
    }
    
    const margin = { top: 20, right: 20, bottom: 30, left: 50 };
    const width = containerEl.clientWidth - margin.left - margin.right;
    const height = containerEl.clientHeight - margin.top - margin.bottom;

    const svg = d3.select(containerEl)
      .append('svg')
      .attr('width', width + margin.left + margin.right)
      .attr('height', height + margin.top + margin.bottom)
      .append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);
      
    const x = d3.scaleBand()
      .domain(data.map(d => d.hour))
      .range([0, width])
      .padding(0.2);

    const y = d3.scaleLinear()
      .domain([0, d3.max(data, d => d.sales) * 1.1])
      .range([height, 0]);

    // X-axis
    svg.append('g')
      .attr('transform', `translate(0,${height})`)
      .call(d3.axisBottom(x).tickValues(x.domain().filter((d, i) => i % 2 === 0)).tickFormat(d => `${d}h`))
      .selectAll("text")
      .style("fill", "#9ca3af");

    // Y-axis
    svg.append('g')
      .call(d3.axisLeft(y).tickFormat(d => `R$${d / 1000}k`).ticks(4))
       .selectAll("text")
      .style("fill", "#9ca3af");

    const tooltip = d3.select(containerEl).append("div")
        .attr("class", "tooltip p-2 rounded-lg bg-gray-900 border border-gray-600 text-xs shadow-lg text-white")
        .style("position", "absolute")
        .style("opacity", 0)
        .style("pointer-events", "none");

    // Bars
    svg.selectAll(".bar")
      .data(data)
      .enter().append("rect")
      .attr("class", "bar")
      .attr("x", d => x(d.hour))
      .attr("y", d => y(d.sales))
      .attr("width", x.bandwidth())
      .attr("height", d => height - y(d.sales))
      .attr("fill", "#2563eb") // blue-600
      .on("mouseover", (event, d) => {
        d3.select(event.currentTarget).attr('fill', '#3b82f6');
        tooltip.transition().duration(200).style("opacity", .9);
        tooltip.html(`
            <strong>${d.hour}:00 - ${d.hour + 1}:00</strong><br/>
            Vendas: <strong>${this.currencyPipe.transform(d.sales, 'BRL')}</strong>
        `)
            .style("left", (event.pageX + 10) + "px")
            .style("top", (event.pageY - 28) + "px");
        })
      .on("mouseout", (event, d) => {
          d3.select(event.currentTarget).attr('fill', '#2563eb');
          tooltip.transition().duration(500).style("opacity", 0);
      });
  }
}
