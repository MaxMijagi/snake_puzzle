FROM nginx:alpine
COPY . /usr/share/nginx/html/snake_puzzle
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
