# Node.js based Dockerfile
# Does not build the server, but runs it directly from source using node

FROM node:22-alpine AS base
WORKDIR /usr/src/app

# Cached dependency install layer
FROM base AS install
RUN mkdir -p /temp/dev
COPY package.json yarn.lock /temp/dev/
RUN cd /temp/dev && yarn install --frozen-lockfile

# exclude devDependencies
RUN mkdir -p /temp/prod
COPY package.json yarn.lock /temp/prod/
RUN cd /temp/prod && yarn install --frozen-lockfile --production

FROM base AS prerelease
COPY --from=install /temp/dev/node_modules node_modules
COPY . .

# copy production dependencies and source code into final image
FROM base AS release
COPY --from=install /temp/prod/node_modules node_modules
COPY --from=prerelease /usr/src/app/src/ ./src/
COPY --from=prerelease /usr/src/app/package.json .

# run the app
USER node
ENTRYPOINT [ "yarn", "run", "dev" ]
