import { RealtimeCoordinatorService } from '../src/services/realtime/realtime-coordinator.service';
import { supabase } from '../src/services/supabase-client';

describe('RealtimeCoordinatorService', () => {
  let service: RealtimeCoordinatorService;
  let mockChannel: any;
  let onEventCallback: any;
  let subscribeCallback: any;
  let mockEventCallback: jasmine.Spy;

  beforeEach(() => {
    service = new RealtimeCoordinatorService();
    mockEventCallback = jasmine.createSpy('onValidEvent');

    mockChannel = {
      on: jasmine.createSpy('on').and.callFake((event, filter, callback) => {
        onEventCallback = callback;
        return mockChannel;
      }),
      subscribe: jasmine.createSpy('subscribe').and.callFake((callback) => {
        subscribeCallback = callback;
        return mockChannel;
      }),
    };

    spyOn(supabase, 'channel').and.returnValue(mockChannel);
    spyOn(supabase, 'removeChannel');
  });

  it('1. start cria subscriptions', () => {
    service.start('store-1', 1, mockEventCallback);
    expect(supabase.channel).toHaveBeenCalledWith('db-changes:store-1');
    expect(mockChannel.on).toHaveBeenCalled();
    expect(mockChannel.subscribe).toHaveBeenCalled();
  });

  it('2. start repetido não duplica channels', () => {
    service.start('store-1', 1, mockEventCallback);
    service.start('store-1', 2, mockEventCallback);
    expect(supabase.removeChannel).toHaveBeenCalledTimes(1); 
    // stop() should be called inside start()
  });

  it('3. stop remove todos os channels', () => {
    service.start('store-1', 1, mockEventCallback);
    service.stop();
    expect(supabase.removeChannel).toHaveBeenCalledWith(mockChannel);
  });

  it('4. stop limpa timers', () => {
    jasmine.clock().install();
    service.start('store-1', 1, mockEventCallback);
    // Trigger error to set timeout
    subscribeCallback('CHANNEL_ERROR');
    
    service.stop();
    // After stop, the timeout should be cleared, no exception when ticking
    jasmine.clock().tick(6000);
    expect(supabase.channel).toHaveBeenCalledTimes(1); // Not called again
    jasmine.clock().uninstall();
  });

  it('5. stop repetido é seguro', () => {
    service.stop();
    service.stop();
    expect(supabase.removeChannel).not.toHaveBeenCalled();
  });

  it('6. evento Store A chega com Store A ativa', () => {
    service.start('store-A', 1, mockEventCallback);
    const payload = { table: 'orders', new: { user_id: 'store-A', id: '1' } };
    onEventCallback(payload);
    expect(mockEventCallback).toHaveBeenCalledWith(payload);
  });

  it('7. evento Store B é ignorado com Store A ativa', () => {
    service.start('store-A', 1, mockEventCallback);
    const payload = { table: 'orders', new: { user_id: 'store-B', id: '1' } };
    onEventCallback(payload);
    expect(mockEventCallback).not.toHaveBeenCalled();
  });

  it('8. recipes usa store_id', () => {
    expect(service.resolveRealtimeStoreId('recipes', { store_id: 'store-1' })).toBe('store-1');
  });

  it('9. store_custom_prices usa store_id', () => {
    expect(service.resolveRealtimeStoreId('store_custom_prices', { store_id: 'store-2' })).toBe('store-2');
  });

  it('10. tabela operacional legada resolve StoreId corretamente', () => {
    expect(service.resolveRealtimeStoreId('orders', { user_id: 'store-3' })).toBe('store-3');
  });

  it('11. evento antigo após store switch é ignorado', () => {
    service.start('store-1', 1, mockEventCallback);
    const oldCallback = onEventCallback;
    
    // Switch to store 2
    service.start('store-2', 2, mockEventCallback);
    
    // Fire event from old callback
    const payload = { table: 'orders', new: { user_id: 'store-1', id: '1' } };
    oldCallback(payload);
    
    expect(mockEventCallback).not.toHaveBeenCalled();
  });

  it('12. logout impede callbacks posteriores', () => {
    service.start('store-1', 1, mockEventCallback);
    service.stop(); // Simulating logout
    
    const payload = { table: 'orders', new: { user_id: 'store-1', id: '1' } };
    onEventCallback(payload);
    
    expect(mockEventCallback).not.toHaveBeenCalled();
  });

  it('13. start funciona após troca de store', () => {
    service.start('store-1', 1, mockEventCallback);
    service.start('store-2', 2, mockEventCallback);
    expect(supabase.channel).toHaveBeenCalledWith('db-changes:store-2');
  });

  it('14. callbacks antigos não atualizam state', () => {
    service.start('store-1', 1, mockEventCallback);
    const oldCallback = onEventCallback;
    
    service.start('store-1', 2, mockEventCallback); // context change but same store
    
    const payload = { table: 'orders', new: { user_id: 'store-1', id: '1' } };
    oldCallback(payload); // from generation 1
    
    expect(mockEventCallback).not.toHaveBeenCalled();
  });

  it('15. retry não sobrevive ao stop', () => {
    jasmine.clock().install();
    service.start('store-1', 1, mockEventCallback);
    subscribeCallback('TIMED_OUT');
    
    service.stop();
    jasmine.clock().tick(6000);
    
    // Start should not be called again
    expect(supabase.channel).toHaveBeenCalledTimes(1);
    jasmine.clock().uninstall();
  });
});
