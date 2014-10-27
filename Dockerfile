FROM phusion/baseimage:0.9.15
MAINTAINER Marek Skrajnowski <m.skrajnowski@gmail.com>

# Set correct environment variables.
ENV HOME /root

# Regenerate SSH host keys. baseimage-docker does not contain any, so you
# have to do that yourself. You may also comment out this instruction; the
# init system will auto-generate one during boot.
RUN /etc/my_init.d/00_regen_ssh_host_keys.sh

# add build & installation scripts
ADD build /root/build

# install kurento
RUN /root/build/kurento.sh

# add kurento configuration
ADD conf/kurento /etc/kurento

# add the kurento service
RUN mkdir /etc/kurento/janus
ADD services/kurento.sh /etc/service/kurento/run

# expose kurento interface
EXPOSE 8888

# Use baseimage-docker's init system.
CMD ["/sbin/my_init"]

# Clean up APT when done.
RUN apt-get clean && rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*
