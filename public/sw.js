// Service Worker para notificações push
self.addEventListener('install', (event) => {
    console.log('Service Worker instalado');
});

self.addEventListener('activate', (event) => {
    console.log('Service Worker ativado');
});

self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'notification') {
        self.registration.showNotification('Lux Chat', {
            body: event.data.body,
            icon: '/icon.png', // Adicione um ícone
            badge: '/badge.png'
        });
    }
});