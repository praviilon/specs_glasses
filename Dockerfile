# PHP + Apache image for hosts that build from a Dockerfile (Railway, Render, Fly.io, etc).
# Not needed for traditional shared hosting — that path just uses the raw PHP files directly.

FROM php:8.3-apache

# MySQL driver for PDO (the app talks to the database exclusively through PDO).
RUN docker-php-ext-install pdo pdo_mysql

# The stock Apache config ships with AllowOverride None, which would silently disable the
# .htaccess files that block direct web access to config.php, includes/, and storage/ — turn
# it on so those protections actually take effect.
RUN sed -ri -e 's!AllowOverride None!AllowOverride All!g' /etc/apache2/apache2.conf

COPY . /var/www/html/

# Uploaded photos are written here at runtime — see the Railway Volumes note in README.md.
RUN mkdir -p /var/www/html/storage/uploads \
    && chown -R www-data:www-data /var/www/html/storage

# Most hosts that build from a Dockerfile (Railway included) only provide the real $PORT value
# at container start, not at build time — so it has to be substituted in the shell, right before
# Apache starts, rather than baked in with a fixed EXPOSE.
CMD sh -c "sed -i \"s/80/\${PORT:-8080}/g\" /etc/apache2/ports.conf /etc/apache2/sites-enabled/000-default.conf && apache2-foreground"
