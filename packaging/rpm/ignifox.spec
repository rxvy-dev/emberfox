# Fedora / RHEL / Alma / Rocky / openSUSE / Nobara.
# rpmbuild -bb packaging/rpm/ignifox.spec --define "_sourcedir $PWD/dist" --define "igni_version 160.0.1-1"
%global debug_package %{nil}
%global __strip /bin/true
%global __provides_exclude_from ^/opt/ignifox/.*$
%global __requires_exclude_from ^/opt/ignifox/.*$
%{!?igni_version: %global igni_version 0-1}
%global upver %(echo %{igni_version} | cut -d- -f1)
%global emrel %(echo %{igni_version} | cut -d- -f2)

Name:           ignifox
Version:        %{upver}
Release:        %{emrel}
Summary:        Telemetry-free, deeply customizable browser built on Firefox
License:        MPL-2.0
URL:            https://github.com/rxvy-dev/ignifox
Source0:        ignifox-%{igni_version}-linux-%{_arch}.tar.xz
ExclusiveArch:  x86_64 aarch64
Requires:       gtk3 alsa-lib dbus-glib libXtst
Recommends:     pulseaudio-libs

%description
Ignifox is Firefox with every telemetry, study and crash-report channel
locked off, sponsored content removed, and Ignifox Studio built in.

%prep
%setup -q -c

%install
mkdir -p %{buildroot}/opt %{buildroot}%{_bindir} %{buildroot}%{_datadir}/applications
cp -a ignifox %{buildroot}/opt/ignifox
rm -f %{buildroot}/opt/ignifox/install.sh
ln -s /opt/ignifox/ignifox %{buildroot}%{_bindir}/ignifox
sed 's|^Exec=ignifox|Exec=%{_bindir}/ignifox|' ignifox/ignifox.desktop > %{buildroot}%{_datadir}/applications/ignifox.desktop
cp -r ignifox/icons %{buildroot}%{_datadir}/icons

%files
/opt/ignifox
%{_bindir}/ignifox
%{_datadir}/applications/ignifox.desktop
%{_datadir}/icons/hicolor/*/apps/ignifox.*
