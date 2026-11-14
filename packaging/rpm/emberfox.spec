# Fedora / RHEL / Alma / Rocky / openSUSE / Nobara.
# rpmbuild -bb packaging/rpm/emberfox.spec --define "_sourcedir $PWD/dist" --define "ember_version 160.0.1-1"
%global debug_package %{nil}
%global __strip /bin/true
%global __provides_exclude_from ^/opt/emberfox/.*$
%global __requires_exclude_from ^/opt/emberfox/.*$
%{!?ember_version: %global ember_version 0-1}
%global upver %(echo %{ember_version} | cut -d- -f1)
%global emrel %(echo %{ember_version} | cut -d- -f2)

Name:           emberfox
Version:        %{upver}
Release:        %{emrel}
Summary:        Telemetry-free, deeply customizable browser built on Firefox
License:        MPL-2.0
URL:            https://github.com/rxvy-dev/emberfox
Source0:        emberfox-%{ember_version}-linux-%{_arch}.tar.xz
ExclusiveArch:  x86_64 aarch64
Requires:       gtk3 alsa-lib dbus-glib libXtst
Recommends:     pulseaudio-libs

%description
Emberfox is Firefox with every telemetry, study and crash-report channel
locked off, sponsored content removed, and Ember Studio built in.

%prep
%setup -q -c

%install
mkdir -p %{buildroot}/opt %{buildroot}%{_bindir} %{buildroot}%{_datadir}/applications
cp -a emberfox %{buildroot}/opt/emberfox
rm -f %{buildroot}/opt/emberfox/install.sh
ln -s /opt/emberfox/emberfox %{buildroot}%{_bindir}/emberfox
sed 's|^Exec=emberfox|Exec=%{_bindir}/emberfox|' emberfox/emberfox.desktop > %{buildroot}%{_datadir}/applications/emberfox.desktop
cp -r emberfox/icons %{buildroot}%{_datadir}/icons

%files
/opt/emberfox
%{_bindir}/emberfox
%{_datadir}/applications/emberfox.desktop
%{_datadir}/icons/hicolor/*/apps/emberfox.*
