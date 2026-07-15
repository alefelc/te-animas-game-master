# Corrección del frontend v2.8.1

El Game Master había quedado activado por defecto y el frontend podía esperar
hasta 16 segundos a un servicio todavía no publicado. La integración también
había reemplazado el flujo normal por uno asíncrono en todas las partidas.

Esta versión:

- mantiene el juego tradicional como flujo predeterminado;
- deja el Game Master apagado hasta que la persona lo active;
- comprueba que el servicio responda antes de habilitar el botón;
- vuelve al selector local inmediatamente cuando no responde;
- reduce los tiempos máximos de espera;
- garantiza que la pantalla de espera siempre se libere;
- agrega una pantalla de recuperación ante errores inesperados;
- acepta campos nuevos que todavía estén vacíos.
