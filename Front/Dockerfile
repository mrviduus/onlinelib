FROM node:12-alpine as builder
COPY package.json package-lock.json ./
RUN npm set progress=false && npm config set depth 0 && npm cache clean --force
RUN npm i && mkdir /ng-app && cp -R ./node_modules ./ng-app
WORKDIR /ng-app
COPY . .

RUN $(npm bin)/ng build --prod


FROM nginx:latest
COPY nginx/default.conf /etc/nginx/conf.d/default.conf
RUN rm -rf /usr/share/nginx/html/*
COPY --from=builder /ng-app/dist/onlineLib /usr/share/nginx/html
RUN chown nginx:nginx /usr/share/nginx/html/*

CMD ["nginx", "-g", "daemon off;"]