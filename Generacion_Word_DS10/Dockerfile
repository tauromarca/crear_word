# Usamos una imagen ligera de Nginx basada en Alpine
FROM nginx:alpine
 
# Establecemos el directorio de trabajo donde Nginx sirve contenido
WORKDIR /usr/share/nginx/html
 
# Eliminamos los archivos por defecto de Nginx
RUN rm -rf ./*
 
# Copiamos todos los archivos del proyecto al contenedor
# Esto incluye el index.html, los scripts .js, la imagen y el anexo2.docx
COPY . .
 
# Exponemos el puerto 80
EXPOSE 80
 
# Nginx se ejecuta automáticamente al iniciar el contenedor
CMD ["nginx", "-g", "daemon off;"]