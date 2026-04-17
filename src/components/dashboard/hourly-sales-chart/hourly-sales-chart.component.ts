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
      .call(d3.axisBottom(x).tickValues(x.domain().filter((d: any, i: number) => i % 2 === 0)).tickFormat((d: any) => `${d}h`))
      .selectAll("text")
      .style("fill", "var(--text-muted)");

    // Y-axis
    svg.append('g')
      .call(d3.axisLeft(y).tickFormat((d: any) => `R$${d / 1000}k`).ticks(4))
       .selectAll("text")
      .style("fill", "var(--text-muted)");

    const tooltip = d3.select(containerEl).append("div")
        .attr("class", "tooltip p-2 rounded-lg chef-surface text-body shadow-lg absolute z-50 pointer-events-none")
        .style("opacity", 0)

    // Bars
    svg.selectAll(".bar")
      .data(data)
      .enter().append("rect")
      .attr("class", "bar")
      .attr("x", (d: any) => x(d.hour))
      .attr("y", (d: any) => y(d.sales))
      .attr("width", x.bandwidth())
      .attr("height", (d: any) => height - y(d.sales))
      .attr("fill", "var(--brand-primary)") // primary
      .on("mouseover", (event: any, d: any) => {
        d3.select(event.currentTarget).attr('fill', "var(--brand-hover)");
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
